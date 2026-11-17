'use strict';

function toUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    manager_id: row.manager_id ? Number(row.manager_id) : null,
    referral_code: row.referral_code || null,
    salesperson_ids: row.salesperson_ids || [],
    created_at: row.created_at || null,
  };
}

async function loadUser(db, id) {
  const [rows] = await db.query(
    'SELECT id,name,email,phone,role,status,manager_id,referral_code FROM users WHERE id = ?',
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

module.exports = { toUser, loadUser };
