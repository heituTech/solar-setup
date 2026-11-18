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

  async events(ctx) {
    const event = ctx.request.body || {};
    if (!event.event_id || !event.event_type) ctx.throw(400, 'invalid_event');
    const result = await consumeInbox(ctx.app.db, event, async () => null);
    ctx.body = { ok: true, duplicate: result.duplicate };
  },
};
