'use strict';

const { salesScopeFor, scopeClause, num } = require('../../lib/scope');

module.exports = {
  async summary(ctx) {
    const scope = salesScopeFor(ctx.state.user);
    const params = [];
    let where = 'WHERE 1 = 1';
    where += scopeClause('salesperson_id', scope, params);
    const [orders] = await ctx.app.db.query(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount,
              COALESCE(SUM(received_amount), 0) AS received
       FROM orders ${where} GROUP BY status`,
      params
    );
    const customerParams = [];
    let customerWhere = 'WHERE 1 = 1';
    customerWhere += scopeClause('owner_id', scope, customerParams);
    const [[customers]] = await ctx.app.db.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'lead' THEN 1 ELSE 0 END) AS leads
       FROM customers ${customerWhere}`,
      customerParams
    );
    const quoteParams = [];
    let quoteWhere = 'WHERE 1 = 1';
    quoteWhere += scopeClause('salesperson_id', scope, quoteParams);
    const [quotes] = await ctx.app.db.query(
      `SELECT status, COUNT(*) AS count FROM quotes ${quoteWhere} GROUP BY status`,
      quoteParams
    );
    ctx.body = {
      customers: { total: Number(customers.total || 0), leads: Number(customers.leads || 0) },
      orders: orders.map((row) => ({
        status: row.status,
        count: Number(row.count),
        amount: num(row.amount),
        received: num(row.received),
      })),
      quotes: quotes.map((row) => ({ status: row.status, count: Number(row.count) })),
    };
  },
};
