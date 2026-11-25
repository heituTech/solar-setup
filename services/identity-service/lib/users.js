'use strict';

function toUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    user_no: row.user_no || null,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    manager_id: row.manager_id ? Number(row.manager_id) : null,
    referral_code: row.referral_code || null,
    salesperson_ids: row.salesperson_ids || [],
    position_id: row.position_id ? Number(row.position_id) : null,
    position_name: row.position_name || null,
    position_level: row.position_level === null || row.position_level === undefined ? null : Number(row.position_level),
    department_code: row.department_code || null,
    department_name: row.department_name || null,
    created_at: row.created_at || null,
  };
}

async function loadUser(db, id) {
  const [rows] = await db.query(
    `SELECT u.id,u.user_no,u.name,u.email,u.phone,u.role,u.status,u.manager_id,u.referral_code,
            u.position_id,p.name AS position_name,p.level AS position_level,
            d.code AS department_code,d.name AS department_name
     FROM users u
     LEFT JOIN org_positions p ON p.id = u.position_id
     LEFT JOIN org_departments d ON d.id = p.department_id
     WHERE u.id = ?`,
    [id]
  );
  if (!rows.length) return null;
  const user = toUser(rows[0]);
  if (user.role === 'sales_manager') {
    const [team] = await db.query(
      "SELECT id FROM users WHERE manager_id = ? AND role = 'salesperson' AND status = 'active'",
      [user.id]
    );
    user.salesperson_ids = team.map((row) => Number(row.id));
  }
  return user;
}

// 用户ID 形如 P000001，按现有最大编号递增。
async function nextUserNo(db) {
  const [rows] = await db.query(
    "SELECT MAX(CAST(SUBSTRING(user_no, 2) AS UNSIGNED)) AS max_no FROM users WHERE user_no LIKE 'P%'"
  );
  const next = Number((rows[0] && rows[0].max_no) || 0) + 1;
  return `P${String(next).padStart(6, '0')}`;
}

// 并发创建时用户ID可能撞号，撞号后重新取号重试。
async function insertUser(db, fields) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userNo = await nextUserNo(db);
    try {
      const [result] = await db.query(
        'INSERT INTO users (user_no, name, email, phone, password_hash, role, status, manager_id, position_id) VALUES (?,?,?,?,?,?,?,?,?)',
        [userNo, fields.name, fields.email || null, fields.phone || null, fields.passwordHash,
          fields.role, fields.status || 'active', fields.managerId || null, fields.positionId || null]
      );
      return { id: result.insertId, user_no: userNo };
    } catch (error) {
      const duplicated = error && error.code === 'ER_DUP_ENTRY' && String(error.message).includes('uk_users_user_no');
      if (!duplicated) throw error;
    }
  }
  throw new Error('user_no_generation_failed');
}

module.exports = { toUser, loadUser, nextUserNo, insertUser };
