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
  note: null,
});

const RATE_FIELDS = [
  'retail_rate', 'engineering_rate_low', 'engineering_rate_mid', 'engineering_rate_high',
  'first_stage_ratio', 'first_stage_threshold', 'final_stage_ratio', 'referral_rate',
];
const AMOUNT_FIELDS = [
  'band_retail_max', 'band_engineering_low_max', 'band_engineering_mid_max',
  'first_order_reward', 'survey_reward', 'base_salary', 'champion_reward',
];
const INT_FIELDS = ['survey_threshold'];
const CHAMPION_BASES = new Set(['received', 'amount', 'commission']);
const RULE_FIELDS = [...RATE_FIELDS, ...AMOUNT_FIELDS, ...INT_FIELDS, 'referral_exclusive', 'champion_basis'];

function num(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function periodOfDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function currentPeriod() {
  return periodOfDate(new Date());
}

function toRule(row) {
  const rule = { ...DEFAULT_RULE };
  if (!row) return rule;
  for (const field of RATE_FIELDS) rule[field] = num(row[field]);
  for (const field of AMOUNT_FIELDS) rule[field] = num(row[field]);
  for (const field of INT_FIELDS) rule[field] = Number(row[field] || 0);
  rule.referral_exclusive = Number(row.referral_exclusive) ? 1 : 0;
  rule.champion_basis = CHAMPION_BASES.has(row.champion_basis) ? row.champion_basis : 'received';
  rule.effective_period = row.effective_period || null;
  rule.note = row.note || null;
  rule.updated_by = row.updated_by ? Number(row.updated_by) : null;
  rule.updated_at = row.updated_at || null;
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

function assertPeriod(period, allowHistorical = false) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))) {
    const error = new Error('invalid_period');
    error.status = 400;
    throw error;
  }
  if (!allowHistorical && String(period) < currentPeriod()) {
    const error = new Error('period_readonly');
    error.status = 400;
    throw error;
  }
}

function validateRuleInput(body = {}, base = DEFAULT_RULE) {
  const data = {};
  for (const field of RATE_FIELDS) {
    if (body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      const error = new Error('invalid_config_value');
      error.status = 400;
      throw error;
    }
    data[field] = value;
  }
  for (const field of AMOUNT_FIELDS) {
    if (body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0) {
      const error = new Error('invalid_config_value');
      error.status = 400;
      throw error;
    }
    data[field] = value;
  }
  for (const field of INT_FIELDS) {
    if (body[field] === undefined) continue;
    const value = Number(body[field]);
    if (!Number.isInteger(value) || value < 0) {
      const error = new Error('invalid_config_value');
      error.status = 400;
      throw error;
    }
    data[field] = value;
  }
  if (body.referral_exclusive !== undefined) data.referral_exclusive = body.referral_exclusive ? 1 : 0;
  if (body.champion_basis !== undefined) {
    if (!CHAMPION_BASES.has(body.champion_basis)) {
      const error = new Error('invalid_champion_basis');
      error.status = 400;
      throw error;
    }
    data.champion_basis = body.champion_basis;
  }
  if (body.note !== undefined) data.note = String(body.note || '').slice(0, 500);

  const merged = { ...base, ...data };
  if (!(merged.band_retail_max > 0)
      || !(merged.band_retail_max < merged.band_engineering_low_max)
      || !(merged.band_engineering_low_max < merged.band_engineering_mid_max)) {
    const error = new Error('invalid_amount_bands');
    error.status = 400;
    throw error;
  }
  if (merged.first_stage_ratio + merged.final_stage_ratio > 1.0001) {
    const error = new Error('invalid_stage_ratio');
    error.status = 400;
    throw error;
  }
  return data;
}

module.exports = {
  DEFAULT_RULE,
  RULE_FIELDS,
  num,
  toRule,
  resolveRule,
  rateForAmount,
  periodOfDate,
  currentPeriod,
  assertPeriod,
  validateRuleInput,
};
