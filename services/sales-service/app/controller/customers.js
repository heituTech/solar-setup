'use strict';

const { salesScopeFor, scopeClause, num } = require('../../lib/scope');

function toCustomer(row) {
  return { ...row, id: Number(row.id), owner_id: row.owner_id ? Number(row.owner_id) : null };
}

module.exports = {
  async list(ctx) {
    const params = [];
    let sql = 'SELECT * FROM customers WHERE 1 = 1';
    sql += scopeClause('owner_id', salesScopeFor(ctx.state.user), params);
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(String(ctx.query.status)); }
    sql += ' ORDER BY id DESC LIMIT 300';
    const [rows] = await ctx.app.db.query(sql, params);
    ctx.body = { customers: rows.map(toCustomer) };
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
    ctx.body = {
      customer,
      surveys,
      quotes: quotes.map((row) => ({ ...row, total_amount: num(row.total_amount) })),
      orders: orders.map((row) => ({ ...row, amount: num(row.amount), received_amount: num(row.received_amount), outstanding: num(row.amount) - num(row.received_amount) })),
    };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const name = String(body.name || '').trim();
    if (!name) ctx.throw(400, 'name_required');
    if (!body.phone && !body.email) ctx.throw(400, 'phone_or_email_required');
    const ownerId = body.owner_id ? Number(body.owner_id) : Number(ctx.state.user.id);
    const ownerName = String(body.owner_name || ctx.state.user.name || '');
    const customerType = body.customer_type === 'engineering' ? 'engineering' : 'retail';
    const [result] = await ctx.app.db.query(
      `INSERT INTO customers (name, phone, email, region, address, source, customer_type, status, owner_id, owner_name, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [name, body.phone || null, body.email || null, body.region || null, body.address || null,
        body.source || 'manual', customerType, body.status || 'lead', ownerId, ownerName, body.note || null]
    );
    ctx.status = 201;
    ctx.body = { customer: toCustomer({ id: result.insertId, name, owner_id: ownerId, owner_name: ownerName, customer_type: customerType, status: body.status || 'lead' }) };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'customer_not_found');
    const current = rows[0];
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(current.owner_id))) ctx.throw(403, 'forbidden');
    const body = ctx.request.body || {};
    const allowed = ['name', 'phone', 'email', 'region', 'address', 'source', 'customer_type', 'status', 'note'];
    const updates = [];
    const params = [];
    for (const field of allowed) {
      if (body[field] !== undefined) { updates.push(`${field} = ?`); params.push(body[field]); }
    }
    if (body.owner_id !== undefined) { updates.push('owner_id = ?'); params.push(Number(body.owner_id)); }
    if (body.owner_name !== undefined) { updates.push('owner_name = ?'); params.push(String(body.owner_name)); }
    if (!updates.length) ctx.throw(400, 'no_fields');
    params.push(id);
    await ctx.app.db.query(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params);
    const [fresh] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [id]);
    ctx.body = { customer: toCustomer(fresh[0]) };
  },
};
