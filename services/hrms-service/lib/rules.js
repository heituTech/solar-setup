'use strict';

const DEFAULT_RULE = Object.freeze({
  effective_period: null,
  retail_rate: 0.08,
  band_retail_max: 1500,
  engineering_rate_low: 0.04,
  band_engineering_low_max: 5000,
  engineering_rate_mid: 0.05,
  band_engineering_mid_max: 15000,
  engineering_rate_high: 0.06,
  first_stage_ratio: 0.3,
  first_stage_threshold: 0.5,
  final_stage_ratio: 0.7,
  referral_rate: 0.01,
  referral_exclusive: 1,
  first_order_reward: 20,
  survey_threshold: 15,
  survey_reward: 50,
  base_salary: 300,
  champion_reward: 0,
  champion_basis: 'received',
});

function num(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function toRule(row) {
  const rule = { ...DEFAULT_RULE };
  if (!row) return rule;
  for (const field of Object.keys(DEFAULT_RULE)) {
    if (field === 'champion_basis' || field === 'effective_period') continue;
    rule[field] = num(row[field]);
  }
  rule.champion_basis = ['received', 'amount', 'commission'].includes(row.champion_basis)
    ? row.champion_basis : 'received';
  rule.effective_period = row.effective_period || null;
  return rule;
}

async function resolveRule(db, period) {
  const [rows] = await db.query(
    'SELECT * FROM commission_rule_versions WHERE effective_period <= ? ORDER BY effective_period DESC LIMIT 1',
    [String(period)]
  );
  return toRule(rows[0]);
}

function rateForAmount(rule, amount) {
  const value = num(amount);
  if (value < num(rule.band_retail_max)) return { order_type: 'retail', rate: num(rule.retail_rate) };
  if (value <= num(rule.band_engineering_low_max)) {
    return { order_type: 'engineering', rate: num(rule.engineering_rate_low) };
  }
  if (value <= num(rule.band_engineering_mid_max)) {
    return { order_type: 'engineering', rate: num(rule.engineering_rate_mid) };
  }
  return { order_type: 'engineering', rate: num(rule.engineering_rate_high) };
}

function periodOfDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function currentPeriod() {
  return periodOfDate(new Date());
}

function assertPeriod(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))) {
    const error = new Error('invalid_period');
    error.status = 400;
    throw error;
  }
}

function nextPeriodStart(period) {
  const [year, month] = period.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return next.toISOString().slice(0, 10);
}

function periodEnd(period) {
  const [year, month] = period.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0));
  return end.toISOString().slice(0, 10);
}

module.exports = {
  DEFAULT_RULE, num, toRule, resolveRule, rateForAmount,
  periodOfDate, currentPeriod, assertPeriod, nextPeriodStart, periodEnd,
};
