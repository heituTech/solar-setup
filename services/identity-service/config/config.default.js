'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const services = {
  identity: process.env.IDENTITY_URL || 'http://127.0.0.1:7101',
  sales: process.env.SALES_URL || 'http://127.0.0.1:7102',
  delivery: process.env.DELIVERY_URL || 'http://127.0.0.1:7103',
  finance: process.env.FINANCE_URL || 'http://127.0.0.1:7104',
};

module.exports = () => ({
  keys: process.env.APP_KEYS || 'solar-identity-local-key',
  security: { csrf: { enable: false } },
  bodyParser: { jsonLimit: '2mb' },
  middleware: ['requestId', 'errorHandler', 'cors'],
  cluster: { listen: { port: Number(process.env.PORT || 7101), hostname: process.env.BIND_HOST || '127.0.0.1' } },
  logger: { level: process.env.LOG_LEVEL || 'INFO', disableConsoleAfterReady: false },
  serviceName: 'identity',
  internal: { secret: process.env.INTERNAL_SERVICE_SECRET || '', services },
  outbox: { maxAttempts: 12 },
  identity: {
    jwtPublicKey: (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n'),
    jwtPrivateKey: (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    tokenTtl: process.env.JWT_EXPIRES_IN || '12h',
    teamRoles: ['salesperson'],
  },
});
