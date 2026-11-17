'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { createDatabase } = require('./lib/database');

async function main() {
  const cwd = process.cwd();
  dotenv.config({ path: path.join(cwd, '.env') });
  const directory = path.join(cwd, 'database', 'migrations');
  if (!process.env.DB_NAME || !process.env.DB_USER) throw new Error('DB_NAME and DB_USER are required');
  const db = createDatabase({ connectionLimit: 1, multipleStatements: true });
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(180) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    for (const filename of files) {
      const sql = await fs.readFile(path.join(directory, filename), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const [rows] = await db.query('SELECT checksum FROM schema_migrations WHERE filename = ?', [filename]);
      if (rows.length) {
        if (rows[0].checksum !== checksum) throw new Error(`Migration checksum changed: ${filename}`);
        continue;
      }
      console.log(`[${process.env.DB_NAME}] applying ${filename}`);
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (filename, checksum) VALUES (?,?)', [filename, checksum]);
    }
    console.log(`[${process.env.DB_NAME}] migrations up to date`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
