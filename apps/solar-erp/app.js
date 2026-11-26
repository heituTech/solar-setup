'use strict';

const fs = require('fs/promises');
const { createDatabase } = require('@solar/service-kit');

module.exports = (app) => {
  app.db = createDatabase({ connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10) });

  app.beforeStart(async () => {
    // 启动即验证数据库连通性，同时确保文件服务目录存在
    await app.db.query('SELECT 1');
    await fs.mkdir(app.config.erp.uploadDir, { recursive: true });
  });
};
