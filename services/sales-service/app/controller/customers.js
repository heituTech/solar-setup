'use strict';

const { withTransaction } = require('@solar/service-kit');
const { salesScopeFor, scopeClause, num } = require('../../lib/scope');

const OWNER_ROLES = new Set(['super_admin', 'sales_manager']);

function toCustomer(row) {
  const data = { ...row };
  // 已弃用字段，不再对外暴露（前端已不使用）
  delete data.source;
  delete data.customer_type;
  return {
    ...data,
    id: Number(row.id),
    owner_id: row.owner_id ? Number(row.owner_id) : null,
    created_by: row.created_by ? Number(row.created_by) : null,
  };
}

function canChangeOwner(user) {
  return OWNER_ROLES.has(user.role);
}

// 客户名称、手机号、邮箱在全库范围内必须唯一，编辑时排除自身
async function assertUniqueCustomer(ctx, { name, phone, email }, excludeId = 0) {
  if (name) {
    const [rows] = await ctx.app.db.query('SELECT id FROM customers WHERE name = ? AND id <> ? LIMIT 1', [name, excludeId]);
    if (rows.length) ctx.throw(409, 'customer_name_exists');
  }
  if (phone) {
    const [rows] = await ctx.app.db.query('SELECT id FROM customers WHERE phone = ? AND id <> ? LIMIT 1', [phone, excludeId]);
    if (rows.length) ctx.throw(409, 'customer_phone_exists');
  }
  if (email) {
    const [rows] = await ctx.app.db.query('SELECT id FROM customers WHERE email = ? AND id <> ? LIMIT 1', [email, excludeId]);
    if (rows.length) ctx.throw(409, 'customer_email_exists');
  }
}

module.exports = {
  async list(ctx) {
    const params = [];
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    let sql = 'SELECT * FROM customers WHERE 1 = 1';
    sql += scopeClause('owner_id', salesScopeFor(ctx.state.user), params);
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(String(ctx.query.status)); }
    const ownerIdRaw = ctx.query.owner_id === undefined ? '' : String(ctx.query.owner_id).trim();
    if (ownerIdRaw) {
      const ownerId = Number(ownerIdRaw);
      if (!Number.isInteger(ownerId) || ownerId <= 0) ctx.throw(400, 'invalid_owner_id');
      sql += ' AND owner_id = ?';
      params.push(ownerId);
    }
    const ownerName = String(ctx.query.owner_name || '').trim();
    if (ownerName) { sql += ' AND owner_name LIKE ?'; params.push(`%${ownerName}%`); }
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const createdFrom = String(ctx.query.created_from || '').trim();
    const createdTo = String(ctx.query.created_to || '').trim();
    if (createdFrom) {
      if (!datePattern.test(createdFrom) || Number.isNaN(Date.parse(createdFrom))) ctx.throw(400, 'invalid_created_from');
      sql += ' AND created_at >= ?';
      params.push(`${createdFrom} 00:00:00`);
    }
    if (createdTo) {
      if (!datePattern.test(createdTo) || Number.isNaN(Date.parse(createdTo))) ctx.throw(400, 'invalid_created_to');
      sql += ' AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(`${createdTo} 00:00:00`);
    }
    if (q) { sql += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [countRows] = await ctx.app.db.query(countSql, params);
    const [rows] = await ctx.app.db.query(`${sql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      params.concat([pageSize, (page - 1) * pageSize]));
    ctx.body = { customers: rows.map(toCustomer), total: Number(countRows[0].total), page, page_size: pageSize };
  },

  async detail(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'customer_not_found');
    const customer = toCustomer(rows[0]);
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(customer.owner_id))) ctx.throw(403, 'forbidden');
    const [surveys] = await ctx.app.db.query('SELECT * FROM surveys WHERE customer_id = ? ORDER BY id DESC', [id]);
    const [quotes] = await ctx.app.db.query('SELECT * FROM quotes WHERE customer_id = ? ORDER BY id DESC', [id]);
    const [orders] = await ctx.app.db.query('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC', [id]);
    const [ownerLogs] = await ctx.app.db.query('SELECT * FROM customer_owner_logs WHERE customer_id = ? ORDER BY id DESC', [id]);
    ctx.body = {
      customer,
      surveys,
      quotes: quotes.map((row) => ({ ...row, total_amount: num(row.total_amount) })),
      orders: orders.map((row) => ({ ...row, amount: num(row.amount), received_amount: num(row.received_amount), outstanding: num(row.amount) - num(row.received_amount) })),
      owner_logs: ownerLogs.map((row) => ({
        ...row,
        id: Number(row.id),
        customer_id: Number(row.customer_id),
        old_owner_id: row.old_owner_id ? Number(row.old_owner_id) : null,
        new_owner_id: row.new_owner_id ? Number(row.new_owner_id) : null,
        changed_by: row.changed_by ? Number(row.changed_by) : null,
      })),
    };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim();
    if (!name) ctx.throw(400, 'name_required');
    if (!phone && !email) ctx.throw(400, 'phone_or_email_required');
    await assertUniqueCustomer(ctx, { name, phone, email });
    const selfId = Number(ctx.state.user.id);
    const requestedOwner = body.owner_id ? Number(body.owner_id) : null;
    if (requestedOwner && requestedOwner !== selfId && !canChangeOwner(ctx.state.user)) {
      ctx.throw(403, 'owner_change_forbidden');
    }
    const ownerId = requestedOwner && requestedOwner > 0 ? requestedOwner : selfId;
    const ownerName = ownerId === selfId
      ? String(ctx.state.user.name || '')
      : String(body.owner_name || '');
    const [result] = await ctx.app.db.query(
      `INSERT INTO customers (name, phone, email, region, address, status, owner_id, owner_name, note, created_by, created_by_name)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [name, phone || null, email || null, body.region || null, body.address || null,
        body.status || 'lead', ownerId, ownerName || null, body.note || null, selfId, ctx.state.user.name || null]
    );
    const [rows] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [result.insertId]);
    ctx.status = 201;
    ctx.body = { customer: toCustomer(rows[0]) };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'customer_not_found');
    const current = rows[0];
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(current.owner_id))) ctx.throw(403, 'forbidden');
    const body = ctx.request.body || {};
    const nextName = body.name !== undefined ? String(body.name || '').trim() : String(current.name || '').trim();
    const nextPhone = body.phone !== undefined ? String(body.phone || '').trim() : String(current.phone || '').trim();
    const nextEmail = body.email !== undefined ? String(body.email || '').trim() : String(current.email || '').trim();
    if (!nextName) ctx.throw(400, 'name_required');
    if ((body.phone !== undefined || body.email !== undefined) && !nextPhone && !nextEmail) {
      ctx.throw(400, 'phone_or_email_required');
    }
    await assertUniqueCustomer(ctx, { name: nextName, phone: nextPhone, email: nextEmail }, id);
    const allowed = ['name', 'phone', 'email', 'region', 'address', 'status', 'note'];
    const updates = [];
    const params = [];
    for (const field of allowed) {
      if (body[field] === undefined) continue;
      const value = { name: nextName, phone: nextPhone || null, email: nextEmail || null }[field];
      updates.push(`${field} = ?`);
      params.push(value === undefined ? body[field] : value);
    }

    const ownerTouched = body.owner_id !== undefined || body.owner_name !== undefined;
    const nextOwnerId = body.owner_id !== undefined
      ? (body.owner_id ? Number(body.owner_id) : null)
      : (current.owner_id ? Number(current.owner_id) : null);
    const nextOwnerName = body.owner_name !== undefined
      ? (body.owner_name ? String(body.owner_name) : null)
      : current.owner_name;
    const ownerChanged = nextOwnerId !== (current.owner_id ? Number(current.owner_id) : null)
      || nextOwnerName !== current.owner_name;
    if (ownerTouched && ownerChanged && !canChangeOwner(ctx.state.user)) {
      ctx.throw(403, 'owner_change_forbidden');
    }
    if (ownerTouched) {
      updates.push('owner_id = ?', 'owner_name = ?');
      params.push(nextOwnerId, nextOwnerName);
    }
    if (!updates.length) ctx.throw(400, 'no_fields');

    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params.concat([id]));
      if (ownerTouched && ownerChanged) {
        await connection.query(
          `INSERT INTO customer_owner_logs
           (customer_id, old_owner_id, old_owner_name, new_owner_id, new_owner_name, changed_by, changed_by_name)
           VALUES (?,?,?,?,?,?,?)`,
          [id, current.owner_id ? Number(current.owner_id) : null, current.owner_name,
            nextOwnerId, nextOwnerName, Number(ctx.state.user.id), ctx.state.user.name || null]
        );
      }
    });
    const [fresh] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [id]);
    ctx.body = { customer: toCustomer(fresh[0]) };
  },

  async remove(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'customer_not_found');
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(rows[0].owner_id))) ctx.throw(403, 'forbidden');
    // 存在关联业务数据时禁止删除，避免产生悬空引用
    const [[o], [q], [s]] = await Promise.all([
      ctx.app.db.query('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?', [id]),
      ctx.app.db.query('SELECT COUNT(*) AS n FROM quotes WHERE customer_id = ?', [id]),
      ctx.app.db.query('SELECT COUNT(*) AS n FROM surveys WHERE customer_id = ?', [id]),
    ]);
    if (o[0].n || q[0].n || s[0].n) {
      ctx.throw(409, 'customer_has_references');
    }
    await ctx.app.db.query('DELETE FROM customer_owner_logs WHERE customer_id = ?', [id]);
    await ctx.app.db.query('DELETE FROM customers WHERE id = ?', [id]);
    ctx.body = { id, deleted: true };
  },
};
