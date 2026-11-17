'use strict';

const { num, salesScopeFor, scopeClause, toLedger } = require('../../lib/finance');

const DUE = "CASE WHEN l.status = 'accepted' AND l.outstanding <= 0 THEN l.commission_amount ELSE 0 END AS commission_due";

module.exports = {
  async list(ctx) {
    const params = [];
    let sql = `SELECT l.*, ${DUE} FROM order_ledger l WHERE 1 = 1`;
    sql += scopeClause('l.salesperson_id', salesScopeFor(ctx.state.user), params);
    if (ctx.query.status) { sql += ' AND l.status = ?'; params.push(String(ctx.query.status)); }
    if (ctx.query.month) { sql += " AND DATE_FORMAT(l.accepted_at, '%Y-%m') = ?"; params.push(String(ctx.query.month)); }
    sql += ' ORDER BY l.id DESC LIMIT 500';
    const [rows] = await ctx.app.db.query(sql, params);
    ctx.body = { ledger: rows.map(toLedger) };
  },

  async summary(ctx) {
    const params = [];
    let where = 'WHERE 1 = 1';
    where += scopeClause('l.salesperson_id', salesScopeFor(ctx.state.user), params);
    const [[totals]] = await ctx.app.db.query(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(l.order_amount), 0) AS order_amount,
              COALESCE(SUM(l.received_amount), 0) AS received_amount,
              COALESCE(SUM(l.outstanding), 0) AS outstanding,
              COALESCE(SUM(CASE WHEN l.status = 'accepted' THEN l.commission_amount ELSE 0 END), 0) AS commission_accrued,
              COALESCE(SUM(CASE WHEN l.status = 'accepted' AND l.outstanding <= 0 THEN l.commission_amount ELSE 0 END), 0) AS commission_due
       FROM order_ledger l ${where}`,
      params
    );
    ctx.body = {
      orders: Number(totals.orders),
      order_amount: num(totals.order_amount),
      received_amount: num(totals.received_amount),
      outstanding: num(totals.outstanding),
      commission_accrued: num(totals.commission_accrued),
      commission_due: num(totals.commission_due),
    };
  },
};
