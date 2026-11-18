'use strict';

const { createDatabase, createAuthMiddleware } = require('@solar/service-kit');

module.exports = (app) => {
  const config = app.config;
  // HRMS 直接连接 finance 数据库，读取台账/回款/规则版本做业绩统计
  app.db = createDatabase();
  app.auth = createAuthMiddleware({
    serviceName: 'hrms',
    internalSecret: config.internal.secret,
    identityUrl: config.internal.services.identity,
    publicKey: config.hrms.jwtPublicKey || undefined,
  });
};
