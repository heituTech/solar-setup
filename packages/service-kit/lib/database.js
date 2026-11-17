'use strict';

const mysql = require('mysql2/promise');

function createDatabase(overrides = {}) {
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 2),
    maxIdle: Number(process.env.DB_MAX_IDLE || 1),
    idleTimeout: Number(process.env.DB_IDLE_TIMEOUT || 300000),
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 8000),
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    queueLimit: 0,
    charset: 'utf8mb4',
    dateStrings: true,
    supportBigNumbers: true,
    ...overrides,
  });
}

async function withTransaction(pool, work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function insertValues(payload) {
  const keys = Object.keys(payload);
  return {
    sql: `(${keys.map((key) => `\`${key}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    values: keys.map((key) => payload[key]),
  };
}

module.exports = { createDatabase, withTransaction, parseJson, insertValues };
