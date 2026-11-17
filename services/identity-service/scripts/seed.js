'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { createDatabase } = require('@solar/service-kit');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'Super Admin';
  if (!email || password.length < 8) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (>= 8 chars) are required');
  }
  const db = createDatabase({ connectionLimit: 1 });
  try {
    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    const hash = await bcrypt.hash(password, 10);
    if (rows.length) {
      await db.query('UPDATE users SET password_hash = ?, role = ?, status = ? WHERE id = ?',
        [hash, 'super_admin', 'active', rows[0].id]);
      console.log(`updated super admin #${rows[0].id} ${email}`);
    } else {
      const [result] = await db.query(
        'INSERT INTO users (name, email, password_hash, role, status) VALUES (?,?,?,?,?)',
        [name, email, hash, 'super_admin', 'active']
      );
      console.log(`created super admin #${result.insertId} ${email}`);
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
