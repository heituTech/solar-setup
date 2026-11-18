'use strict';

const bcrypt = require('bcryptjs');
const { signAccessToken, verifyAccessToken } = require('@solar/service-kit');
const { loadUser, toUser } = require('../../lib/users');

// 登录失败限速：同一账号 15 分钟内连续失败 5 次，锁定 15 分钟。
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map();

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
    const [result] = await ctx.app.db.query(
      'INSERT INTO users (name, email, phone, password_hash, role, status) VALUES (?,?,?,?,?,?)',
      [name, email, phone, hash, 'member', 'active']
    );
    const user = await loadUser(ctx.app.db, result.insertId);
    ctx.status = 201;
    ctx.body = { token: signAccessToken(user), user };
  },

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
      'SELECT id, password_hash, status FROM users WHERE email = ? OR phone = ? OR name = ? LIMIT 1',
      [identifier.toLowerCase(), identifier, identifier]
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
