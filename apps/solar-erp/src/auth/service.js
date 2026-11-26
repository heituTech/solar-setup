'use strict';

const bcrypt = require('bcryptjs');
const { badRequest, conflict, notFound, str, pageParams, paged } = require('../common/http');

const ROLES = ['admin', 'store_manager', 'store_clerk', 'electrical_engineer', 'structural_engineer', 'construction_captain'];
const STORE_ROLES = ['store_manager', 'store_clerk'];

function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

function assertRole(role) {
  if (!ROLES.includes(role)) badRequest('invalid_role');
}

async function findByUsername(db, username) {
  const [rows] = await db.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

async function list(db, query = {}) {
  const { page, pageSize, offset } = pageParams(query);
  const where = [];
  const params = [];
  if (query.role) { where.push('role = ?'); params.push(query.role); }
  if (query.status) { where.push('status = ?'); params.push(query.status); }
  if (query.keyword) {
    where.push('(username LIKE ? OR name LIKE ? OR phone LIKE ?)');
    const like = `%${query.keyword}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM users ${clause}`, params);
  const [items] = await db.query(
    `SELECT id, username, name, role, store_id, phone, email, status, last_login_at, created_at
     FROM users ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return paged(items, total, page, pageSize);
}

async function create(db, payload, actor) {
  const username = str(payload.username, { required: true, max: 60, field: 'username' });
  if (!/^[a-zA-Z0-9_.-]{3,60}$/.test(username)) badRequest('invalid_username');
  const name = str(payload.name, { required: true, max: 80, field: 'name' });
  const role = str(payload.role, { required: true, max: 40, field: 'role' });
  assertRole(role);
  const password = String(payload.password || '');
  if (password.length < 6) badRequest('password_too_short');

  let storeId = payload.store_id ? Number(payload.store_id) : null;
  if (STORE_ROLES.includes(role)) {
    if (!storeId) badRequest('store_required');
    const [stores] = await db.query('SELECT id FROM stores WHERE id = ? AND status = ? LIMIT 1', [storeId, 'active']);
    if (!stores.length) badRequest('store_not_found');
  } else {
    storeId = null;
  }

  const [exists] = await db.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  if (exists.length) conflict('username_exists');

  const [inserted] = await db.query(
    `INSERT INTO users (username, password_hash, name, role, store_id, phone, email, status)
     VALUES (?,?,?,?,?,?,?,?)`,
    [username, bcrypt.hashSync(password, 10), name, role, storeId,
      str(payload.phone, { max: 40 }), str(payload.email, { max: 120 }), 'active']
  );
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [inserted.insertId]);
  const user = publicUser(rows[0]);
  const { record } = require('../common/audit');
  await record(db, { module: 'auth', entity: 'user', entityId: user.id, action: 'create', actor, after: user });
  return user;
}

async function update(db, id, payload, actor) {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) notFound('user_not_found');
  const before = publicUser(rows[0]);

  const sets = [];
  const params = [];
  if (payload.name !== undefined) {
    const name = str(payload.name, { required: true, max: 80, field: 'name' });
    sets.push('name = ?'); params.push(name);
  }
  if (payload.role !== undefined) {
    const role = str(payload.role, { required: true, max: 40, field: 'role' });
    assertRole(role);
    sets.push('role = ?'); params.push(role);
  }
  if (payload.store_id !== undefined || payload.role !== undefined) {
    const role = payload.role ? String(payload.role) : before.role;
    let storeId = payload.store_id !== undefined ? Number(payload.store_id) || null : before.store_id;
    if (STORE_ROLES.includes(role)) {
      if (!storeId) badRequest('store_required');
      const [stores] = await db.query('SELECT id FROM stores WHERE id = ? AND status = ? LIMIT 1', [storeId, 'active']);
      if (!stores.length) badRequest('store_not_found');
    } else {
      storeId = null;
    }
    sets.push('store_id = ?'); params.push(storeId);
  }
  if (payload.phone !== undefined) { sets.push('phone = ?'); params.push(str(payload.phone, { max: 40 })); }
  if (payload.email !== undefined) { sets.push('email = ?'); params.push(str(payload.email, { max: 120 })); }
  if (payload.status !== undefined) {
    const status = ['active', 'disabled'].includes(payload.status) ? payload.status : 'active';
    sets.push('status = ?'); params.push(status);
  }
  if (payload.password) {
    if (String(payload.password).length < 6) badRequest('password_too_short');
    sets.push('password_hash = ?'); params.push(bcrypt.hashSync(String(payload.password), 10));
  }
  if (!sets.length) badRequest('nothing_to_update');
  params.push(id);
  await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);

  const [afterRows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  const after = publicUser(afterRows[0]);
  const { record } = require('../common/audit');
  await record(db, { module: 'auth', entity: 'user', entityId: id, action: 'update', actor, before, after });
  return after;
}

async function disable(db, id, actor) {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) notFound('user_not_found');
  await db.query("UPDATE users SET status = 'disabled' WHERE id = ?", [id]);
  const { record } = require('../common/audit');
  await record(db, {
    module: 'auth', entity: 'user', entityId: id, action: 'disable', actor,
    before: publicUser(rows[0]), after: { status: 'disabled' },
  });
  return { id: Number(id), status: 'disabled' };
}

module.exports = { ROLES, STORE_ROLES, publicUser, findByUsername, list, create, update, disable };
