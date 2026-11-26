'use strict';

/**
 * 公共数据库工具：统一从 service-kit 引入，业务域不直接依赖 mysql2。
 */
const { createDatabase, withTransaction, parseJson, insertValues } = require('@solar/service-kit');

module.exports = { createDatabase, withTransaction, parseJson, insertValues };
