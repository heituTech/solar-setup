'use strict';

const { verifyAccessToken, consumeInbox } = require('@solar/service-kit');
const { loadUser } = require('../../lib/users');
const { isTokenRevoked } = require('../../lib/revocation');

module.exports = {
  async introspect(ctx) {
    const header = ctx.get('authorization');
    if (!header.startsWith('Bearer ')) ctx.throw(401, 'invalid_token');
    let payload;
    try {
      payload = verifyAccessToken(header.slice(7).trim(), ctx.app.config.identity.jwtPublicKey);
    } catch {
      ctx.throw(401, 'invalid_token');
    }
    if (await isTokenRevoked(ctx.app.db, payload.jti)) ctx.throw(401, 'invalid_token');
    const user = await loadUser(ctx.app.db, payload.sub);
    if (!user || user.status !== 'active' || user.role !== payload.role) ctx.throw(401, 'invalid_token');
    ctx.body = { user };
  },

  async contacts(ctx) {
    // 供 HRMS 生成业绩报告时获取员工邮箱，仅返回内部员工
    const [rows] = await ctx.app.db.query(
      "SELECT id, name, email, role, status FROM users WHERE role <> 'member' ORDER BY id"
    );
    ctx.body = {
      users: rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        email: row.email || null,
        role: row.role,
        status: row.status,
      })),
    };
  },

  async events(ctx) {
    const event = ctx.request.body || {};
    if (!event.event_id || !event.event_type) ctx.throw(400, 'invalid_event');
    const result = await consumeInbox(ctx.app.db, event, async () => null);
    ctx.body = { ok: true, duplicate: result.duplicate };
  },
};
