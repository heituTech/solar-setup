const bcrypt = require('bcryptjs');
const { composePhone, phoneMatchCandidates } = require('./phones');

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mapDuplicateError(e) {
  if (!e || e.code !== 'ER_DUP_ENTRY') return e;
  const text = String(e.message || '');
  if (text.includes('uq_users_username')) return httpError('username_exists', 409);
  if (text.includes('uq_users_email')) return httpError('email_exists', 409);
  if (text.includes('uq_users_phone')) return httpError('phone_exists', 409);
  return httpError('duplicate_entry', 409);
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashPassword(password) {
  if (!password || String(password).length < 6) throw httpError('password_too_short');
  return bcrypt.hashSync(String(password), 10);
}

async function assertManager(conn, managerId) {
  if (!managerId) throw httpError('manager_required');
  const [rows] = await conn.query("SELECT id FROM users WHERE id = ? AND role = 'sales_manager' AND status = 'active'", [managerId]);
  if (!rows.length) throw httpError('invalid_manager');
  return managerId;
}

async function assertPhoneAvailable(conn, phone, excludeId = null, countryCode = 'KH') {
  const candidates = phoneMatchCandidates(phone, countryCode);
  if (!candidates.length) return;
  const params = [...candidates];
  let sql = `SELECT id FROM users
             WHERE REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') IN (${candidates.map(() => '?').join(',')})`;
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await conn.query(sql + ' LIMIT 1', params);
  if (rows.length) throw httpError('phone_exists', 409);
}

async function createStaff(conn, data, allowedRoles) {
  const role = data.role;
  if (!allowedRoles.includes(role)) throw httpError('invalid_role', 403);
  const username = normalizeUsername(data.username);
  if (!username) throw httpError('username_required');
  const email = data.email ? normalizeEmail(data.email) : null;
  const passwordHash = data.password_hash || hashPassword(data.password);
  if (!passwordHash) throw httpError('password_required');
  const countryCode = String(data.phone_country || 'KH').toUpperCase();
  const phone = data.phone ? composePhone(data.phone, countryCode) : null;
  if (data.phone && !phone) throw httpError('invalid_phone');
  if (phone) await assertPhoneAvailable(conn, phone, null, countryCode);
  const fullName = data.full_name ? String(data.full_name).trim().slice(0, 100) : null;
  let managerId = null;
  if (role === 'salesperson' && data.manager_id !== null && data.manager_id !== undefined && data.manager_id !== '') {
    managerId = await assertManager(conn, Number(data.manager_id));
  }
  const [result] = await conn.query(
    `INSERT INTO users (username, email, password_hash, role, status, full_name, phone, phone_country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [username, email, passwordHash, role, data.status === 'disabled' ? 'disabled' : 'active', fullName, phone, phone ? countryCode : null]
  );
  if (managerId) {
    await conn.query(
      'INSERT INTO sales_manager_links (manager_id, salesperson_id) VALUES (?, ?)',
      [managerId, result.insertId]
    );
  }
  return result.insertId;
}

async function updateStaff(conn, id, changes, allowedRoles) {
  const [rows] = await conn.query('SELECT id, role, status FROM users WHERE id = ?', [id]);
  const target = rows[0];
  if (!target) throw httpError('user_not_found', 404);
  if (!allowedRoles.includes(target.role)) throw httpError('forbidden', 403);

  const fields = [];
  const values = [];
  if ('username' in changes) {
    const username = normalizeUsername(changes.username);
    if (!username) throw httpError('username_required');
    fields.push('username = ?');
    values.push(username);
  }
  if ('email' in changes) {
    fields.push('email = ?');
    values.push(changes.email ? normalizeEmail(changes.email) : null);
  }
  if ('phone' in changes) {
    if (changes.phone) {
      const phone = composePhone(changes.phone, 'KH');
      if (!phone) throw httpError('invalid_phone');
      await assertPhoneAvailable(conn, phone, id);
      fields.push('phone = ?', 'phone_country = ?');
      values.push(phone, 'KH');
    } else {
      fields.push('phone = ?', 'phone_country = ?');
      values.push(null, null);
    }
  }
  if ('status' in changes) {
    if (!['active', 'disabled'].includes(changes.status)) throw httpError('invalid_status');
    fields.push('status = ?');
    values.push(changes.status);
  }
  if ('password_hash' in changes && changes.password_hash) {
    fields.push('password_hash = ?');
    values.push(changes.password_hash);
  }
  let managerChange = null;
  if ('manager_id' in changes) {
    if (target.role !== 'salesperson') throw httpError('manager_id_not_allowed');
    const raw = changes.manager_id;
    const managerId = raw === null || raw === '' || raw === 0 || raw === undefined
      ? null
      : await assertManager(conn, Number(raw));
    managerChange = { managerId };
  }
  if (!fields.length && !managerChange) throw httpError('no_updates');
  if (fields.length) {
    values.push(id);
    await conn.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  if (managerChange) {
    await conn.query('DELETE FROM sales_manager_links WHERE salesperson_id = ?', [id]);
    if (managerChange.managerId !== null) {
      await conn.query(
        'INSERT INTO sales_manager_links (manager_id, salesperson_id) VALUES (?, ?)',
        [managerChange.managerId, id]
      );
    }
  }
  return true;
}

async function deleteStaff(conn, id, allowedRoles) {
  const [rows] = await conn.query('SELECT id, role FROM users WHERE id = ?', [id]);
  const target = rows[0];
  if (!target) throw httpError('user_not_found', 404);
  if (!allowedRoles.includes(target.role)) throw httpError('forbidden', 403);
  if (target.role === 'sales_manager') {
    const [subs] = await conn.query("SELECT COUNT(*) AS count FROM sales_manager_links WHERE manager_id = ?", [id]);
    if (subs[0].count > 0) throw httpError('manager_has_subordinates', 409);
  }
  await conn.query("UPDATE approval_requests SET status = 'cancelled', reviewed_at = NOW() WHERE requester_id = ? AND status = 'pending'", [id]);
  await conn.query('DELETE FROM users WHERE id = ?', [id]);
  return true;
}

module.exports = {
  httpError,
  mapDuplicateError,
  normalizeUsername,
  normalizeEmail,
  hashPassword,
  createStaff,
  updateStaff,
  deleteStaff,
  assertManager,
};
