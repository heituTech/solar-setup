'use strict';

const { createDatabase, createAuthMiddleware, publishOutbox } = require('@solar/service-kit');

module.exports = (app) => {
  const config = app.config;
  app.db = createDatabase();
  app.auth = createAuthMiddleware({
    serviceName: 'finance',
    internalSecret: config.internal.secret,
    identityUrl: config.internal.services.identity,
    publicKey: config.finance.jwtPublicKey || undefined,
  });

  app.beforeStart(async () => {
    app.outboxTimer = setInterval(() => {
      publishOutbox(app).catch((error) => app.logger.warn('outbox publish failed: %s', error.message));
    }, 3000);
    app.outboxTimer.unref();
  });
};
