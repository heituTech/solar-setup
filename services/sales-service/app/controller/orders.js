'use strict';

const { salesScopeFor, scopeClause, num } = require('../../lib/scope');

function toOrder(row) {
  return {
    ...row,
    id: Number(row.id),
    customer_id: Number(row.customer_id),
    salesperson_id: Number(row.salesperson_id),
    project_id: row.project_id ? Number(row.project_id) : null,
    quote_id: row.quote_id ? Number(row.quote_id) : null,
    amount: num(row.amount),
    received_amount: num(row.received_amount),
    outstanding: Math.round((num(row.amount) - num(row.received_amount)) * 100) / 100,
    commission_rate: num(row.commission_rate),
  };
}

module.exports = {
  async list(ctx) {
    const params = [];
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    let sql = 'SELECT * FROM orders WHERE 1 = 1';
    sql += scopeClause('salesperson_id', salesScopeFor(ctx.state.user), params);
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(String(ctx.query.status)); }
    if (q) { sql += ' AND (order_no LIKE ? OR customer_name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [countRows] = await ctx.app.db.query(countSql, params);
    const [rows] = await ctx.app.db.query(`${sql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      params.concat([pageSize, (page - 1) * pageSize]));
    ctx.body = { orders: rows.map(toOrder), total: Number(countRows[0].total), page, page_size: pageSize };
  },

  async detail(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'order_not_found');
    const order = toOrder(rows[0]);
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(order.salesperson_id)) ctx.throw(403, 'forbidden');
    const [quotes] = await ctx.app.db.query('SELECT * FROM quotes WHERE id = ?', [order.quote_id || 0]);
    ctx.body = { order, quote: quotes[0] || null };
  },

  async updateCommission(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const rate = Number(body.commission_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) ctx.throw(400, 'invalid_commission_rate');
    const [rows] = await ctx.app.db.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'order_not_found');
    if (rows[0].status === 'accepted') ctx.throw(409, 'order_already_accepted');
    await ctx.app.db.query('UPDATE orders SET commission_rate = ? WHERE id = ?', [rate, id]);
    ctx.body = { id, commission_rate: rate };
  },
};
