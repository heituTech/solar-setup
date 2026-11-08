const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function migrate() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        await pool.query(stmt);
      }
      console.log(`Applied ${file}`);
    }
    console.log('Migration completed.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
