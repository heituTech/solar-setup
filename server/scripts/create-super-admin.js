const bcrypt = require('bcryptjs');
const pool = require('../db');

const [username, password, email] = process.argv.slice(2);

if (!username || !password) {
  console.error('Usage: npm run create-super-admin -- <username> <password> [email]');
  process.exit(1);
}

async function run() {
  try {
    const hash = bcrypt.hashSync(password, 10);
    await pool.query(
      `INSERT INTO users (username, email, role, status, password_hash)
       VALUES (?, ?, 'super_admin', 'active', ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'super_admin', status = 'active'`,
      [username.trim().toLowerCase(), email ? email.trim().toLowerCase() : null, hash]
    );
    console.log(`Super admin "${username}" is ready.`);
  } catch (err) {
    console.error('Failed to create super admin:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
