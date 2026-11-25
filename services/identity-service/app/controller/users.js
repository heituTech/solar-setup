'use strict';

const bcrypt = require('bcryptjs');
const { withTransaction, enqueueEvent } = require('@solar/service-kit');
const { EVENTS, ROLES } = require('@solar/contracts');
const { toUser, loadUser, insertUser } = require('../../lib/users');

const ASSIGNABLE = new Set(ROLES);

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
      `SELECT u.id,u.user_no,u.name,u.email,u.phone,u.role,u.status,u.manager_id,u.created_at FROM users u${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
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
    const managerId = body.manager_id ? Number(body.manager_id) : null;
    const created = await insertUser(ctx.app.db, {
      name, email, phone, passwordHash: hash, role, status: 'active', managerId,
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
    };
    if (!ASSIGNABLE.has(next.role)) ctx.throw(400, 'invalid_role');
    if (!['active', 'disabled'].includes(next.status)) ctx.throw(400, 'invalid_status');
    if (!next.email && !next.phone) ctx.throw(400, 'email_or_phone_required');
    const [duplicated] = await ctx.app.db.query(
      'SELECT id FROM users WHERE id <> ? AND ((email IS NOT NULL AND email = ?) OR (phone IS NOT NULL AND phone = ?)) LIMIT 1',
      [id, next.email, next.phone]
    );
    if (duplicated.length) ctx.throw(409, 'account_exists');
    let passwordHash = current.password_hash;
    if (body.password) {
      if (String(body.password).length < 8) ctx.throw(400, 'password_too_short');
      passwordHash = await bcrypt.hash(String(body.password), 10);
    }
    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query(
        'UPDATE users SET name = ?, email = ?, phone = ?, role = ?, status = ?, manager_id = ?, password_hash = ? WHERE id = ?',
        [next.name, next.email, next.phone, next.role, next.status, next.manager_id, passwordHash, id]
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
