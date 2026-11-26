'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = () => ({
  keys: process.env.APP_KEYS || 'solar-erp-local-key',
  security: { csrf: { enable: false } },
  // 文件服务走 base64 JSON 上传，放宽 body 限制
  bodyParser: { jsonLimit: '25mb' },
  middleware: ['requestId', 'errorHandler', 'cors'],
  cluster: {
    listen: {
      port: Number(process.env.PORT || 7200),
      hostname: process.env.BIND_HOST || '127.0.0.1',
    },
  },
  logger: { level: process.env.LOG_LEVEL || 'INFO', disableConsoleAfterReady: false },
  serviceName: process.env.SERVICE_NAME || 'erp',
  erp: {
    jwtSecret: process.env.ERP_JWT_SECRET || 'erp-local-dev-secret-change-me',
    jwtExpiresIn: process.env.ERP_JWT_EXPIRES_IN || '12h',
    captchaEnabled: process.env.CAPTCHA_ENABLED === 'true',
    uploadDir: path.join(__dirname, '..', process.env.UPLOAD_DIR || 'storage/files'),
    notify: {
      wecom: process.env.WECOM_WEBHOOK || '',
      feishu: process.env.FEISHU_WEBHOOK || '',
    },
  },
});
