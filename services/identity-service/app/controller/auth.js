'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { signAccessToken, verifyAccessToken } = require('@solar/service-kit');
const { loadUser, toUser, insertUser } = require('../../lib/users');
const { sendVerificationCode } = require('../../lib/mailer');

// 登录失败限速：同一账号 15 分钟内连续失败 5 次，锁定 15 分钟。
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map();

// 邮箱验证码：10 分钟有效，同一邮箱 60 秒内只能获取一次，单条验证码最多试 5 次。
const CODE_TTL_MINUTES = 10;
const CODE_INTERVAL_SECONDS = 60;
const CODE_MAX_ATTEMPTS = 5;

function lockKey(identifier) {
  return String(identifier || '').trim().toLowerCase();
}

function remainingLockMs(key) {
  const entry = failures.get(key);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) return entry.lockedUntil - Date.now();
  if (Date.now() - entry.firstAt > FAILURE_WINDOW_MS) failures.delete(key);
  return 0;
}

function recordFailure(key) {
  const now = Date.now();
  const entry = failures.get(key) || { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - entry.firstAt > FAILURE_WINDOW_MS) {
    entry.count = 0;
    entry.firstAt = now;
    entry.lockedUntil = 0;
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = now + LOCK_MS;
  failures.set(key, entry);
  if (failures.size > 5000) {
    for (const [key2, value] of failures) {
      if (!value.lockedUntil && now - value.firstAt > FAILURE_WINDOW_MS) failures.delete(key2);
    }
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function normalizePhone(value) {
  const phone = String(value || '').trim();
  return phone || null;
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

module.exports = {
  async register(ctx) {
    const body = ctx.request.body || {};
    const name = String(body.name || '').trim();
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const password = String(body.password || '');
    if (!name) ctx.throw(400, 'name_required');
    if (!email && !phone) ctx.throw(400, 'email_or_phone_required');
    if (password.length < 8) ctx.throw(400, 'password_too_short');
    const [exists] = await ctx.app.db.query(
      'SELECT id FROM users WHERE (email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone = ?) LIMIT 1',
      [email, phone]
    );
    if (exists.length) ctx.throw(409, 'account_exists');
    const hash = await bcrypt.hash(password, 10);
    const created = await insertUser(ctx.app.db, {
      name, email, phone, passwordHash: hash, role: 'member', status: 'active', managerId: null,
    });
    const user = await loadUser(ctx.app.db, created.id);
    ctx.status = 201;
    ctx.body = { token: signAccessToken(user), user };
  },

  // 方式一：用户ID / 手机号 / 邮箱 + 密码
  async login(ctx) {
    const body = ctx.request.body || {};
    const identifier = String(body.identifier || body.email || body.phone || '').trim();
    const password = String(body.password || '');
    if (!identifier || !password) ctx.throw(400, 'credentials_required');
    const key = lockKey(identifier);
    const lockedMs = remainingLockMs(key);
    if (lockedMs > 0) {
      ctx.set('Retry-After', String(Math.ceil(lockedMs / 1000)));
      ctx.throw(429, 'too_many_attempts');
    }
    const [rows] = await ctx.app.db.query(
      'SELECT id, password_hash, status FROM users WHERE user_no = ? OR phone = ? OR email = ? LIMIT 1',
      [identifier.toUpperCase(), identifier, identifier.toLowerCase()]
    );
    if (!rows.length) {
      recordFailure(key);
      ctx.throw(401, 'invalid_credentials');
    }
    if (rows[0].status !== 'active') ctx.throw(403, 'account_disabled');
    const matched = await bcrypt.compare(password, rows[0].password_hash);
    if (!matched) {
      recordFailure(key);
      ctx.throw(401, 'invalid_credentials');
    }
    failures.delete(key);
    const user = await loadUser(ctx.app.db, rows[0].id);
    ctx.body = { token: signAccessToken(user), user };
  },

  // 方式二第一步：向已注册邮箱发送 6 位验证码
  async requestEmailCode(ctx) {
    const body = ctx.request.body || {};
    const email = normalizeEmail(body.email);
    if (!email) ctx.throw(400, 'email_required');
    const [users] = await ctx.app.db.query('SELECT id, status FROM users WHERE email = ? LIMIT 1', [email]);
    if (!users.length) ctx.throw(404, 'user_not_found');
    if (users[0].status !== 'active') ctx.throw(403, 'account_disabled');

    const [recent] = await ctx.app.db.query(
      `SELECT id FROM email_codes
        WHERE email = ? AND purpose = 'login' AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
        LIMIT 1`,
      [email, CODE_INTERVAL_SECONDS]
    );
    if (recent.length) ctx.throw(429, 'code_too_frequent');

    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    await ctx.app.db.query(
      "INSERT INTO email_codes (email, code, purpose, expires_at) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL ? MINUTE))",
      [email, hashCode(code), 'login', CODE_TTL_MINUTES]
    );
    try {
      await sendVerificationCode(ctx.app.config.mail, email, code);
    } catch (error) {
      ctx.logger.error('[email-code] send failed: %s', error.message);
      ctx.throw(502, 'code_send_failed');
    }
    ctx.body = { ok: true, expires_in: CODE_TTL_MINUTES * 60 };
  },

  // 方式二第二步：邮箱 + 验证码登录
  async loginWithCode(ctx) {
    const body = ctx.request.body || {};
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();
    if (!email) ctx.throw(400, 'email_required');
    if (!/^\d{6}$/.test(code)) ctx.throw(400, 'invalid_code');

    const [codes] = await ctx.app.db.query(
      `SELECT id, code, expires_at, attempts FROM email_codes
        WHERE email = ? AND purpose = 'login' AND consumed_at IS NULL
        ORDER BY id DESC LIMIT 1`,
      [email]
    );
    if (!codes.length) ctx.throw(400, 'invalid_code');
    const record = codes[0];
    if (new Date(record.expires_at).getTime() < Date.now()) ctx.throw(400, 'code_expired');
    if (Number(record.attempts) >= CODE_MAX_ATTEMPTS) {
      ctx.set('Retry-After', String(CODE_INTERVAL_SECONDS));
      ctx.throw(429, 'too_many_attempts');
    }
    if (record.code !== hashCode(code)) {
      await ctx.app.db.query('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', [record.id]);
      ctx.throw(400, 'invalid_code');
    }
    await ctx.app.db.query('UPDATE email_codes SET consumed_at = NOW() WHERE id = ?', [record.id]);

    const [users] = await ctx.app.db.query('SELECT id, status FROM users WHERE email = ? LIMIT 1', [email]);
    if (!users.length) ctx.throw(401, 'invalid_credentials');
    if (users[0].status !== 'active') ctx.throw(403, 'account_disabled');
    const user = await loadUser(ctx.app.db, users[0].id);
    ctx.body = { token: signAccessToken(user), user };
  },

  async me(ctx) {
    ctx.body = { user: toUser(ctx.state.user) };
  },

  async logout(ctx) {
    // 把当前 token 的 jti 写入吊销表，剩余有效期内 introspect 一律拒绝。
    const header = ctx.get('authorization') || '';
    try {
      const payload = verifyAccessToken(header.slice(7).trim(), ctx.app.config.identity.jwtPublicKey);
      if (payload.jti) {
        await ctx.app.db.query(
          'INSERT IGNORE INTO revoked_tokens (jti, user_id, expires_at) VALUES (?,?,FROM_UNIXTIME(?))',
          [payload.jti, Number(payload.sub) || null, payload.exp]
        );
        await ctx.app.db.query('DELETE FROM revoked_tokens WHERE expires_at < NOW()');
      }
    } catch {
      // token 已过期或非法：无需吊销
    }
    ctx.body = { ok: true };
  },
};
