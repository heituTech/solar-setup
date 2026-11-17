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
  keys: process.env.APP_KEYS || 'solar-finance-local-key',
  security: { csrf: { enable: false } },
  bodyParser: { jsonLimit: '2mb' },
  middleware: ['requestId', 'errorHandler', 'cors'],
  cluster: { listen: { port: Number(process.env.PORT || 7104), hostname: '0.0.0.0' } },
  logger: { level: process.env.LOG_LEVEL || 'INFO', disableConsoleAfterReady: false },
  serviceName: 'finance',
  internal: { secret: process.env.INTERNAL_SERVICE_SECRET || '', services },
  outbox: { maxAttempts: 12 },
  finance: {
    jwtPublicKey: (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n'),
  },
});
