const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function initDb() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    // Split by semicolons, filter empty
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log('Database initialized successfully.');
    console.log('Default admin password: admin123');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDb();
