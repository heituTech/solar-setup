'use strict';

const { internalFetch } = require('@solar/service-kit');
const { num } = require('../../lib/finance');
const {
  resolveManagerRule, rateForTeamAmount, currentPeriod, assertPeriod,
} = require('../../lib/manager-commission-rules');

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function toManagerLedger(row) {
  return {
    ...row,
    id: Number(row.id),
    manager_id: Number(row.manager_id),
    team_size: Number(row.team_size || 0),
    order_count: Number(row.order_count || 0),
    order_amount: num(row.order_amount),
    received_amount: num(row.received_amount),
    commission_rate: num(row.commission_rate),
    commission_amount: num(row.commission_amount),
    bonus_amount: num(row.bonus_amount),
    base_salary: num(row.base_salary),
    total_payable: num(row.total_payable),
  };
}

async function fetchContacts(ctx) {
  const config = ctx.app.config;
  const data = await internalFetch(`${config.internal.services.identity}/internal/users/contacts`, {
    service: 'finance',
    secret: config.internal.secret,
    requestId: ctx.state.requestId,
    body: {},
  });
  return data.users || [];
}

function placeholders(values) {
  return values.map(() => '?').join(',');
}

module.exports = {
  async list(ctx) {
    const params = [];
    let where = ' WHERE 1 = 1';
    if (ctx.state.user.role === 'sales_manager') {
      where += ' AND manager_id = ?';
      params.push(Number(ctx.state.user.id));
    }
    if (ctx.query.period) { where += ' AND period = ?'; params.push(String(ctx.query.period)); }
    const [rows] = await ctx.app.db.query(
      `SELECT * FROM manager_ledger${where} ORDER BY period DESC, total_payable DESC`, params
    );
    ctx.body = { ledger: rows.map(toManagerLedger) };
  },

  async generate(ctx) {
    const body = ctx.request.body || {};
    const period = String(body.period || currentPeriod());
    assertPeriod(period, false);
    const rule = await resolveManagerRule(ctx.app.db, period);

    const contacts = await fetchContacts(ctx);
    const managers = new Map();
    for (const user of contacts) {
      if (user.role === 'sales_manager' && user.status === 'active') {
        managers.set(Number(user.id), { id: Number(user.id), name: user.name || null, members: [] });
      }
    }
    // 仅统计有上级经理的在职销售；无上级经理的订单不计入任何经理台账
    for (const user of contacts) {
      if (user.role !== 'salesperson' || user.status !== 'active' || !user.manager_id) continue;
      const manager = managers.get(Number(user.manager_id));
      if (manager) manager.members.push(Number(user.id));
    }

    const generatedBy = Number(ctx.state.user.id);
    for (const manager of managers.values()) {
      // 口径：经理自签订单只计入团队回款，不重复拿销售个人提成
      const teamIds = [...new Set([manager.id, ...manager.members])];
      const inClause = placeholders(teamIds);
      const [[orderRow]] = await ctx.app.db.query(
        `SELECT COUNT(*) AS order_count, COALESCE(SUM(order_amount), 0) AS order_amount
         FROM order_ledger
         WHERE salesperson_id IN (${inClause})
           AND DATE_FORMAT(COALESCE(accepted_at, created_at), '%Y-%m') = ?`,
        [...teamIds, period]
      );
      const [[paymentRow]] = await ctx.app.db.query(
        `SELECT SUM(CASE WHEN p.direction = 'in' THEN p.amount ELSE -p.amount END) AS net_amount
         FROM payments p JOIN order_ledger l ON l.order_id = p.order_id
         WHERE l.salesperson_id IN (${inClause}) AND DATE_FORMAT(p.received_at, '%Y-%m') = ?`,
        [...teamIds, period]
      );
      let received = paymentRow && paymentRow.net_amount !== null ? num(paymentRow.net_amount) : null;
      if (received === null) {
        // 无 payments 流水时回退到台账累计回款（近似值，仅用于本地/历史数据兜底）
        const [[ledgerRow]] = await ctx.app.db.query(
          `SELECT COALESCE(SUM(received_amount), 0) AS received
           FROM order_ledger
           WHERE salesperson_id IN (${inClause})
             AND DATE_FORMAT(COALESCE(accepted_at, created_at), '%Y-%m') = ?`,
          [...teamIds, period]
        );
        received = num(ledgerRow.received);
      }
      received = round2(received);
      const rate = rateForTeamAmount(rule, received);
      const commission = round2(received * rate);
      const bonus = num(rule.team_threshold) > 0 && received >= num(rule.team_threshold)
        ? num(rule.team_bonus) : 0;
      const baseSalary = num(rule.base_salary);
      const total = round2(commission + bonus + baseSalary);
      const columns = [
        'period', 'manager_id', 'manager_name', 'team_size', 'order_count', 'order_amount',
        'received_amount', 'commission_rate', 'commission_amount', 'bonus_amount', 'base_salary',
        'total_payable', 'rule_period', 'generated_by',
      ];
      const values = [
        period, manager.id, manager.name, manager.members.length, Number(orderRow.order_count || 0),
        num(orderRow.order_amount), received, rate, commission, bonus, baseSalary, total,
        rule.effective_period || period, generatedBy,
      ];
      await ctx.app.db.query(
        `INSERT INTO manager_ledger (${columns.join(',')}) VALUES (${placeholders(values)})
         ON DUPLICATE KEY UPDATE manager_name = VALUES(manager_name), team_size = VALUES(team_size),
           order_count = VALUES(order_count), order_amount = VALUES(order_amount),
           received_amount = VALUES(received_amount), commission_rate = VALUES(commission_rate),
           commission_amount = VALUES(commission_amount), bonus_amount = VALUES(bonus_amount),
           base_salary = VALUES(base_salary), total_payable = VALUES(total_payable),
           rule_period = VALUES(rule_period), generated_by = VALUES(generated_by), generated_at = NOW()`,
        values
      );
    }

    const [rows] = await ctx.app.db.query(
      'SELECT * FROM manager_ledger WHERE period = ? ORDER BY manager_name, manager_id', [period]
    );
    ctx.body = { period, ledger: rows.map(toManagerLedger) };
  },
};
