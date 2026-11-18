'use strict';

const { createDatabase, createAuthMiddleware, publishOutbox } = require('@solar/service-kit');
const { loadUser } = require('./lib/users');
const { isTokenRevoked } = require('./lib/revocation');

module.exports = (app) => {
  const config = app.config;
  app.db = createDatabase();
  app.auth = createAuthMiddleware({
    serviceName: 'identity',
    internalSecret: config.internal.secret,
    identityUrl: config.internal.services.identity,
    publicKey: config.identity.jwtPublicKey || undefined,
    loadUser: async (payload) => {
      if (await isTokenRevoked(app.db, payload.jti)) return null;
      return loadUser(app.db, payload.sub);
    },
  });

  app.beforeStart(async () => {
    app.outboxTimer = setInterval(() => {
      publishOutbox(app).catch((error) => app.logger.warn('outbox publish failed: %s', error.message));
    }, 3000);
    app.outboxTimer.unref();
  });
};
