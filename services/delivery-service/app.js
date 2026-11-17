'use strict';

const { createDatabase, createAuthMiddleware, publishOutbox } = require('@solar/service-kit');

module.exports = (app) => {
  const config = app.config;
  app.db = createDatabase();
  app.auth = createAuthMiddleware({
    serviceName: 'delivery',
    internalSecret: config.internal.secret,
    identityUrl: config.internal.services.identity,
    publicKey: config.delivery.jwtPublicKey || undefined,
  });

  app.beforeStart(async () => {
    app.outboxTimer = setInterval(() => {
      publishOutbox(app).catch((error) => app.logger.warn('outbox publish failed: %s', error.message));
    }, 3000);
    app.outboxTimer.unref();
  });
};
