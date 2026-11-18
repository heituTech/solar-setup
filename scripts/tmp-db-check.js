'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  try {
    const c = await mysql.createConnection({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    });
    const [version] = await c.query('SELECT VERSION() v');
    const [grants] = await c.query('SHOW GRANTS');
    console.log('connected', version[0].v);
    console.log(grants.map((g) => Object.values(g)[0]).join('\n'));
    await c.end();
  } catch (error) {
    console.error('FAILED', error.code, error.message);
  }
})();
