'use strict';

const { createDatabase, createAuthMiddleware, verifyAccessToken, publishOutbox } = require('@solar/service-kit');
const { loadUser } = require('./lib/users');
const { isTokenRevoked } = require('./lib/revocation');

module.exports = (app) => {
  const config = app.config;
  app.db = createDatabase();
  const authenticate = createAuthMiddleware({
    serviceName: 'identity',
    internalSecret: config.internal.secret,
    identityUrl: config.internal.services.identity,
    publicKey: config.identity.jwtPublicKey || undefined,
    loadUser: async (payload) => {
      if (await isTokenRevoked(app.db, payload.jti)) return null;
      return loadUser(app.db, payload.sub);
    },
  });
  // 鉴权中间件缓存用户 30s，注销后必须立即失效，因此在缓存命中前先查吊销表。
  app.auth = async (ctx, next) => {
    const header = ctx.get('authorization') || '';
    if (header.startsWith('Bearer ')) {
      try {
        const payload = verifyAccessToken(header.slice(7).trim(), config.identity.jwtPublicKey || undefined);
        if (await isTokenRevoked(app.db, payload.jti)) ctx.throw(401, 'unauthorized');
      } catch (error) {
        if (error.status === 401) throw error;
      }
    }
    return authenticate(ctx, next);
  };

  app.beforeStart(async () => {
    app.outboxTimer = setInterval(() => {
      publishOutbox(app).catch((error) => app.logger.warn('outbox publish failed: %s', error.message));
    }, 3000);
    app.outboxTimer.unref();
  });
};
