'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const mysql = require('mysql2/promise');

async function main() {
  const name = process.env.DB_NAME;
  if (!name || !/^[A-Za-z0-9_]+$/.test(name)) throw new Error('DB_NAME is invalid');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
  });
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` DEFAULT CHARACTER SET utf8mb4`);
    console.log(`[${name}] database ready`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
