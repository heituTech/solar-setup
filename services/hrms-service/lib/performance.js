'use strict';

const { num, resolveRule, rateForAmount, periodOfDate, nextPeriodStart } = require('./rules');

function round2(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

function emptyRow(user) {
  return {
    salesperson_id: Number(user.id),
    name: user.name || null,
    email: user.email || null,
    role: user.role || null,
    order_amount: 0,
    order_count: 0,
    received_amount: 0,
    outstanding: 0,
    new_customers: 0,
    commission: 0,
    referral_reward: 0,
    first_order_reward: 0,
    diligence_reward: 0,
    champion_reward: 0,
    award_total: 0,
    deduction_total: 0,
    base_salary: 0,
    estimated_payable: 0,
    survey_count: 0,
    is_champion: false,
    actual_settlement: null,
  };
}

async function buildPerformance(db, period, users) {
  const rule = await resolveRule(db, period);
  const rows = new Map();
  const eligibleRoles = new Set(['salesperson', 'sales_manager']);
  for (const user of users) {
    if (eligibleRoles.has(user.role)) rows.set(Number(user.id), emptyRow(user));
  }

  const [ledgerRows] = await db.query(
    `SELECT id, order_id, order_no, customer_id, salesperson_id, salesperson_name,
            order_amount, received_amount, outstanding, status, referral_flag, deal_date, accepted_at
     FROM order_ledger
     WHERE DATE_FORMAT(COALESCE(deal_date, created_at), '%Y-%m') = ?`,
    [period]
  );

  const [paymentRows] = await db.query(
    `SELECT l.salesperson_id, l.order_id, l.referral_flag,
            SUM(CASE WHEN p.direction = 'in' THEN p.amount ELSE -p.amount END) AS net_amount
     FROM payments p JOIN order_ledger l ON l.order_id = p.order_id
     WHERE DATE_FORMAT(p.received_at, '%Y-%m') = ?
     GROUP BY l.salesperson_id, l.order_id, l.referral_flag`,
    [period]
  );

  const [cumulativeRows] = await db.query(
    `SELECT order_id, SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) AS total
     FROM payments WHERE received_at < ? GROUP BY order_id`,
    [nextPeriodStart(period)]
  );
  const cumulative = new Map(cumulativeRows.map((row) => [Number(row.order_id), num(row.total)]));

  const [newCustomerRows] = await db.query(
    `SELECT l.salesperson_id, COUNT(DISTINCT l.customer_id) AS total
     FROM order_ledger l
     JOIN (SELECT customer_id, MIN(id) AS first_id FROM order_ledger GROUP BY customer_id) f ON f.first_id = l.id
     WHERE DATE_FORMAT(COALESCE(l.deal_date, l.created_at), '%Y-%m') = ?
     GROUP BY l.salesperson_id`,
    [period]
  );

  const [firstPeriodRows] = await db.query(
    `SELECT salesperson_id, MIN(DATE_FORMAT(COALESCE(deal_date, created_at), '%Y-%m')) AS first_period
     FROM order_ledger WHERE salesperson_id IS NOT NULL GROUP BY salesperson_id`
  );

  const [surveyRows] = await db.query(
    `SELECT salesperson_id, COUNT(*) AS total FROM survey_records
     WHERE is_valid = 1 AND DATE_FORMAT(survey_date, '%Y-%m') = ? GROUP BY salesperson_id`,
    [period]
  );

  const [adjustmentRows] = await db.query(
    `SELECT salesperson_id, type, SUM(amount) AS total FROM commission_adjustments
     WHERE DATE_FORMAT(created_at, '%Y-%m') = ? GROUP BY salesperson_id, type`,
    [period]
  );

  const [settlementRows] = await db.query(
    'SELECT user_id, payable, commission_total, status FROM settlements WHERE period = ?',
    [period]
  );

  for (const row of ledgerRows) {
    if (!row.salesperson_id) continue;
    const userId = Number(row.salesperson_id);
    if (!rows.has(userId)) {
      rows.set(userId, emptyRow({ id: userId, name: row.salesperson_name, role: 'salesperson' }));
    }
    const stat = rows.get(userId);
    const amount = num(row.order_amount);
    const dealPeriod = periodOfDate(row.deal_date) || period;
    const dealRule = await resolveRule(db, dealPeriod);
    const band = rateForAmount(dealRule, amount);
    const rate = Number(row.referral_flag) && dealRule.referral_exclusive ? 0 : band.rate;
    const totalCommission = round2(amount * rate);
    const received = cumulative.get(Number(row.order_id)) || 0;
    const depositDue = received >= round2(amount * dealRule.first_stage_threshold)
      ? round2(totalCommission * dealRule.first_stage_ratio) : 0;
    const accepted = String(row.status || '') === 'accepted'
      && (!row.accepted_at || String(periodOfDate(row.accepted_at)) <= period);
    const finalDue = received >= amount && accepted
      ? round2(totalCommission * dealRule.final_stage_ratio) : 0;
    stat.order_amount = round2(stat.order_amount + amount);
    stat.order_count += 1;
    stat.outstanding = round2(stat.outstanding + num(row.outstanding));
    stat.commission = round2(stat.commission + depositDue + finalDue);
  }

  const surveyCounts = new Map(surveyRows.map((row) => [Number(row.salesperson_id), Number(row.total)]));
  const firstPeriods = new Map(
    firstPeriodRows.map((row) => [Number(row.salesperson_id), row.first_period])
  );
  const newCustomers = new Map(
    newCustomerRows.map((row) => [Number(row.salesperson_id), Number(row.total)])
  );
  const settlements = new Map(
    settlementRows.map((row) => [Number(row.user_id), row])
  );

  for (const row of paymentRows) {
    if (!row.salesperson_id) continue;
    const userId = Number(row.salesperson_id);
    if (!rows.has(userId)) rows.set(userId, emptyRow({ id: userId, role: 'salesperson' }));
    const stat = rows.get(userId);
    const net = num(row.net_amount);
    stat.received_amount = round2(stat.received_amount + net);
    if (Number(row.referral_flag)) {
      stat.referral_reward = round2(stat.referral_reward + net * num(rule.referral_rate));
    }
  }

  for (const row of adjustmentRows) {
    const stat = rows.get(Number(row.salesperson_id));
    if (!stat) continue;
    const amount = num(row.total);
    if (row.type === 'award') stat.award_total = round2(stat.award_total + amount);
    else stat.deduction_total = round2(stat.deduction_total + amount);
  }

  for (const stat of rows.values()) {
    stat.survey_count = surveyCounts.get(stat.salesperson_id) || 0;
    stat.new_customers = newCustomers.get(stat.salesperson_id) || 0;
    stat.base_salary = num(rule.base_salary);
    stat.first_order_reward = firstPeriods.get(stat.salesperson_id) === period && stat.order_count > 0
      ? num(rule.first_order_reward) : 0;
    stat.diligence_reward = stat.survey_count >= num(rule.survey_threshold) ? num(rule.survey_reward) : 0;
    const settlement = settlements.get(stat.salesperson_id);
    if (settlement) {
      stat.actual_settlement = {
        payable: num(settlement.payable),
        commission_total: num(settlement.commission_total),
        status: settlement.status,
      };
    }
  }

  const basisField = { received: 'received_amount', amount: 'order_amount', commission: 'commission' }[
    rule.champion_basis
  ] || 'received_amount';
  let champion = null;
  for (const stat of rows.values()) {
    if (stat[basisField] > (champion ? champion[basisField] : 0)) champion = stat;
  }
  if (champion) {
    champion.is_champion = true;
    champion.champion_reward = num(rule.champion_reward);
  }

  for (const stat of rows.values()) {
    stat.estimated_payable = round2(
      stat.base_salary + stat.commission + stat.referral_reward + stat.first_order_reward
      + stat.diligence_reward + stat.champion_reward + stat.award_total - stat.deduction_total
    );
  }

  const list = Array.from(rows.values()).sort((a, b) => b[basisField] - a[basisField]);
  const team = {
    period,
    total_sales: round2(list.reduce((sum, item) => sum + item.order_amount, 0)),
    total_received: round2(list.reduce((sum, item) => sum + item.received_amount, 0)),
    total_outstanding: round2(list.reduce((sum, item) => sum + item.outstanding, 0)),
    new_customers: list.reduce((sum, item) => sum + item.new_customers, 0),
    order_count: list.reduce((sum, item) => sum + item.order_count, 0),
    salespeople_count: list.length,
    champion: champion ? {
      salesperson_id: champion.salesperson_id,
      name: champion.name,
      value: champion[basisField],
    } : null,
    champion_basis: rule.champion_basis,
    rows: list,
  };

  return { period, rule, rows: list, team };
}

module.exports = { buildPerformance, round2 };
