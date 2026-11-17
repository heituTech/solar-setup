'use strict';

const bcrypt = require('bcryptjs');
const { signAccessToken } = require('@solar/service-kit');
const { loadUser, toUser } = require('../../lib/users');

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
    const [rows] = await ctx.app.db.query(
      'SELECT id, password_hash, status FROM users WHERE email = ? OR phone = ? OR name = ? LIMIT 1',
      [identifier.toLowerCase(), identifier, identifier]
    );
    if (!rows.length) ctx.throw(401, 'invalid_credentials');
    if (rows[0].status !== 'active') ctx.throw(403, 'account_disabled');
    const matched = await bcrypt.compare(password, rows[0].password_hash);
    if (!matched) ctx.throw(401, 'invalid_credentials');
    const user = await loadUser(ctx.app.db, rows[0].id);
    ctx.body = { token: signAccessToken(user), user };
  },

  async me(ctx) {
    ctx.body = { user: toUser(ctx.state.user) };
  },

  async logout(ctx) {
    ctx.body = { ok: true };
  },
};
