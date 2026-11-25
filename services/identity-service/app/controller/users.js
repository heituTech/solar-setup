'use strict';

const bcrypt = require('bcryptjs');
const { withTransaction, enqueueEvent } = require('@solar/service-kit');
const { EVENTS, ROLES } = require('@solar/contracts');
const { toUser, loadUser, insertUser } = require('../../lib/users');

const ASSIGNABLE = new Set(ROLES);

// 角色与所属上级的约束：
// 销售人员只能归属销售部门经理；电气/结构工程师只能归属工程部经理或超级管理员
const MANAGER_ROLES_BY_ROLE = {
  salesperson: ['sales_manager'],
  electrical_engineer: ['engineering_manager', 'super_admin'],
  structural_engineer: ['engineering_manager', 'super_admin'],
};

// 校验职位可用且与角色匹配；管理岗唯一任职
async function resolvePosition(db, ctx, role, positionId, excludeUserId = null) {
  if (!positionId) return null;
  const [rows] = await db.query('SELECT * FROM org_positions WHERE id = ? AND active = 1', [Number(positionId)]);
  if (!rows.length) ctx.throw(400, 'position_not_found');
  const position = rows[0];
  if (position.role_key && position.role_key !== role) ctx.throw(400, 'position_role_mismatch');
  if (position.single_holder) {
    const params = [Number(positionId)];
    let sql = "SELECT id FROM users WHERE position_id = ? AND status = 'active'";
    if (excludeUserId) { sql += ' AND id <> ?'; params.push(Number(excludeUserId)); }
    const [holders] = await db.query(`${sql} LIMIT 1`, params);
    if (holders.length) ctx.throw(409, 'position_occupied');
  }
  return position;
}

// 职位所属上级 = 上级职位在岗人员；职位空缺时为空
async function managerForPosition(db, position) {
  if (!position || !position.parent_id) return null;
  const [rows] = await db.query(
    "SELECT id FROM users WHERE position_id = ? AND status = 'active' ORDER BY id LIMIT 1",
    [Number(position.parent_id)]
  );
  return rows.length ? Number(rows[0].id) : null;
}

async function resolveManagerId(db, ctx, role, managerId) {
  const allowed = MANAGER_ROLES_BY_ROLE[role];
  if (!allowed) return managerId;
  if (!managerId) ctx.throw(400, 'manager_required');
  const [rows] = await db.query('SELECT id, role FROM users WHERE id = ?', [managerId]);
  if (!rows.length) ctx.throw(400, 'manager_not_found');
  if (!allowed.includes(rows[0].role)) ctx.throw(400, 'invalid_manager_role');
  return managerId;
}

module.exports = {
  async directory(ctx) {
    const [rows] = await ctx.app.db.query(
      "SELECT id, user_no, name, role FROM users WHERE status = 'active' AND role <> 'member' ORDER BY role, name"
    );
    ctx.body = {
      users: rows.map((row) => ({ id: Number(row.id), user_no: row.user_no, name: row.name, role: row.role })),
    };
  },

  async list(ctx) {
    const user = ctx.state.user;
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    const status = String(ctx.query.status || '').trim();
    const role = String(ctx.query.role || '').trim();
    const conditions = [];
    const params = [];
    if (user.role === 'sales_manager') {
      conditions.push('(u.manager_id = ? OR u.id = ?)');
      params.push(Number(user.id), Number(user.id));
    }
    if (q) {
      conditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status) {
      conditions.push('u.status = ?');
      params.push(status);
    }
    if (role) {
      conditions.push('u.role = ?');
      params.push(role);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const [countRows] = await ctx.app.db.query(`SELECT COUNT(*) AS total FROM users u${where}`, params);
    const offset = (page - 1) * pageSize;
    const [rows] = await ctx.app.db.query(
      `SELECT u.id,u.user_no,u.name,u.email,u.phone,u.role,u.status,u.manager_id,u.created_at,
              u.position_id,p.name AS position_name,p.level AS position_level,
              d.code AS department_code,d.name AS department_name
       FROM users u
       LEFT JOIN org_positions p ON p.id = u.position_id
       LEFT JOIN org_departments d ON d.id = p.department_id
       ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    ctx.body = { users: rows.map(toUser), total: Number(countRows[0].total), page, page_size: pageSize };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase() || null;
    const phone = String(body.phone || '').trim() || null;
    const role = String(body.role || 'salesperson');
    const password = String(body.password || '');
    if (!name) ctx.throw(400, 'name_required');
    if (!email && !phone) ctx.throw(400, 'email_or_phone_required');
    if (!ASSIGNABLE.has(role)) ctx.throw(400, 'invalid_role');
    if (password.length < 8) ctx.throw(400, 'password_too_short');
    const [exists] = await ctx.app.db.query(
      'SELECT id FROM users WHERE (email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone = ?) LIMIT 1',
      [email, phone]
    );
    if (exists.length) ctx.throw(409, 'account_exists');
    const hash = await bcrypt.hash(password, 10);
    const positionId = body.position_id ? Number(body.position_id) : null;
    const position = await resolvePosition(ctx.app.db, ctx, role, positionId);
    // 有职位时由组织架构自动确定所属负责人，否则沿用角色约束
    const managerId = position
      ? await managerForPosition(ctx.app.db, position)
      : await resolveManagerId(ctx.app.db, ctx, role, body.manager_id ? Number(body.manager_id) : null);
    const created = await insertUser(ctx.app.db, {
      name, email, phone, passwordHash: hash, role, status: 'active', managerId, positionId,
    });
    const user = await loadUser(ctx.app.db, created.id);
    ctx.status = 201;
    ctx.body = { user };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const [rows] = await ctx.app.db.query('SELECT * FROM users WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'user_not_found');
    const current = rows[0];
    if (Number(ctx.state.user.id) === id && body.status === 'disabled') ctx.throw(400, 'cannot_disable_self');
    const next = {
      name: body.name !== undefined ? String(body.name).trim() : current.name,
      email: body.email !== undefined ? (String(body.email).trim().toLowerCase() || null) : current.email,
      phone: body.phone !== undefined ? (String(body.phone).trim() || null) : current.phone,
      role: body.role !== undefined ? String(body.role) : current.role,
      status: body.status !== undefined ? String(body.status) : current.status,
      manager_id: body.manager_id !== undefined ? (body.manager_id ? Number(body.manager_id) : null) : current.manager_id,
      position_id: body.position_id !== undefined
        ? (body.position_id ? Number(body.position_id) : null)
        : (current.position_id ? Number(current.position_id) : null),
    };
    if (!ASSIGNABLE.has(next.role)) ctx.throw(400, 'invalid_role');
    if (!['active', 'disabled'].includes(next.status)) ctx.throw(400, 'invalid_status');
    if (!next.email && !next.phone) ctx.throw(400, 'email_or_phone_required');
    const position = await resolvePosition(ctx.app.db, ctx, next.role, next.position_id, id);
    next.manager_id = position
      ? await managerForPosition(ctx.app.db, position)
      : await resolveManagerId(ctx.app.db, ctx, next.role, next.manager_id);
    if (next.email) {
      const [emailTaken] = await ctx.app.db.query(
        'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [next.email, id]
      );
      if (emailTaken.length) ctx.throw(409, 'email_exists');
    }
    if (next.phone) {
      const [phoneTaken] = await ctx.app.db.query(
        'SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1', [next.phone, id]
      );
      if (phoneTaken.length) ctx.throw(409, 'phone_exists');
    }
    let passwordHash = current.password_hash;
    if (body.password) {
      if (String(body.password).length < 8) ctx.throw(400, 'password_too_short');
      passwordHash = await bcrypt.hash(String(body.password), 10);
    }
    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query(
        `UPDATE users SET name = ?, email = ?, phone = ?, role = ?, status = ?, manager_id = ?,
          position_id = ?, password_hash = ? WHERE id = ?`,
        [next.name, next.email, next.phone, next.role, next.status, next.manager_id,
          next.position_id, passwordHash, id]
      );
      await enqueueEvent(connection, {
        type: EVENTS.USER_CHANGED,
        aggregateId: id,
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales', 'delivery', 'finance'],
        payload: { user_id: id, name: next.name, role: next.role, status: next.status },
      });
    });
    ctx.body = { user: await loadUser(ctx.app.db, id) };
  },
};
