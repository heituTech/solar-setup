'use strict';

const { salesScopeFor, scopeClause, num } = require('../../lib/scope');

// 概览范围：总经理看公司，部门经理看本部门，员工看个人
function overviewScope(user) {
  const level = user.position_level === null || user.position_level === undefined
    ? null : Number(user.position_level);
  const department = user.department_code || null;
  if (user.role === 'super_admin' || level === 1) return { scope: 'company', department };
  if (level === 2) return { scope: 'department', department };
  return { scope: 'self', department };
}

module.exports = {
  async overview(ctx) {
    const user = ctx.state.user;
    const { scope, department } = overviewScope(user);
    const role = user.role;
    const salesView = scope === 'company'
      || (scope === 'department' && department === 'sales')
      || (scope === 'self' && ['super_admin', 'sales_manager', 'salesperson'].includes(role));
    const financeView = scope === 'company' || (scope === 'department' && department === 'finance');
    const engineeringView = scope === 'company' || (scope === 'department' && department === 'engineering');
    const selfEngineerView = scope === 'self' && ['electrical_engineer', 'structural_engineer'].includes(role);

    const ownerScope = salesView
      ? (scope === 'company' ? null : salesScopeFor(user))
      : null;

    const customers = { total: 0, leads: 0 };
    const quotes = { total: 0, pending: 0 };
    const orders = { total: 0, amount: 0, received: 0, outstanding: 0 };
    const surveys = { total: 0, pending: 0, active: 0, completed: 0 };

    if (salesView) {
      const customerParams = [];
      let customerWhere = 'WHERE 1 = 1';
      customerWhere += scopeClause('owner_id', ownerScope, customerParams);
      const [[customerRow]] = await ctx.app.db.query(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'lead' THEN 1 ELSE 0 END) AS leads
         FROM customers ${customerWhere}`,
        customerParams
      );
      customers.total = Number(customerRow.total || 0);
      customers.leads = Number(customerRow.leads || 0);

      const quoteParams = [];
      let quoteWhere = 'WHERE 1 = 1';
      quoteWhere += scopeClause('salesperson_id', ownerScope, quoteParams);
      const [[quoteRow]] = await ctx.app.db.query(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pending
         FROM quotes ${quoteWhere}`,
        quoteParams
      );
      quotes.total = Number(quoteRow.total || 0);
      quotes.pending = Number(quoteRow.pending || 0);
    }

    if (salesView || financeView || engineeringView) {
      const params = [];
      let where = "WHERE status <> 'void'";
      // 销售视图按团队/个人过滤；财务、工程部门看全公司订单
      if (salesView && !financeView && !engineeringView) {
        where += scopeClause('salesperson_id', ownerScope, params);
      }
      const [[orderRow]] = await ctx.app.db.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount,
                COALESCE(SUM(received_amount), 0) AS received
         FROM orders ${where}`,
        params
      );
      orders.total = Number(orderRow.total || 0);
      orders.amount = num(orderRow.amount);
      orders.received = num(orderRow.received);
      orders.outstanding = Math.round((orders.amount - orders.received) * 100) / 100;
    }

    if (engineeringView || selfEngineerView) {
      const params = [];
      let where = 'WHERE 1 = 1';
      if (selfEngineerView) {
        where += ' AND (engineer_id = ? OR created_by = ?)';
        params.push(Number(user.id), Number(user.id));
      }
      const [[surveyRow]] = await ctx.app.db.query(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status IN ('reviewed', 'completion_pending') THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
         FROM surveys ${where}`,
        params
      );
      surveys.total = Number(surveyRow.total || 0);
      surveys.pending = Number(surveyRow.pending || 0);
      surveys.active = Number(surveyRow.active || 0);
      surveys.completed = Number(surveyRow.completed || 0);
    }

    ctx.body = { scope, department, customers, quotes, orders, surveys };
  },

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
