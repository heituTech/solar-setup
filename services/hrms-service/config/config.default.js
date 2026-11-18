'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const services = {
  identity: process.env.IDENTITY_URL || 'http://127.0.0.1:7101',
  sales: process.env.SALES_URL || 'http://127.0.0.1:7102',
  delivery: process.env.DELIVERY_URL || 'http://127.0.0.1:7103',
  finance: process.env.FINANCE_URL || 'http://127.0.0.1:7104',
  hrms: process.env.HRMS_URL || 'http://127.0.0.1:7105',
};

module.exports = () => ({
  keys: process.env.APP_KEYS || 'solar-hrms-local-key',
  security: { csrf: { enable: false } },
  bodyParser: { jsonLimit: '2mb' },
  middleware: ['requestId', 'errorHandler', 'cors'],
  cluster: { listen: { port: Number(process.env.PORT || 7105), hostname: process.env.BIND_HOST || '127.0.0.1' } },
  logger: { level: process.env.LOG_LEVEL || 'INFO', disableConsoleAfterReady: false },
  serviceName: 'hrms',
  internal: { secret: process.env.INTERNAL_SERVICE_SECRET || '', services },
  hrms: {
    jwtPublicKey: (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n'),
    reportEnabled: process.env.HRMS_REPORT_ENABLED !== 'false',
    reportHour: Number(process.env.HRMS_REPORT_HOUR || 20),
    timezoneOffsetHours: Number(process.env.HRMS_TIMEZONE_OFFSET || 8),
  },
  mail: {
    devMode: process.env.MAIL_DEV_MODE !== 'false',
    from: process.env.MAIL_FROM || 'HEITU ERP <public@heitu.tech>',
    alimail: {
      appId: process.env.ALI_MAIL_APP_ID || '',
      appSecret: process.env.ALI_MAIL_APP_SECRET || '',
      sender: process.env.ALI_MAIL_SENDER || 'public@heitu.tech',
    },
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE !== 'false',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },
});
