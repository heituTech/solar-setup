'use strict';

const { num, currentPeriod, assertPeriod } = require('./commission-rules');

const DEFAULT_MANAGER_RULE = Object.freeze({
  effective_period: null,
  tier1_max: 50000,
  tier1_rate: 0.01,
  tier2_max: 200000,
  tier2_rate: 0.012,
  tier3_rate: 0.015,
  base_salary: 0,
  team_threshold: 0,
  team_bonus: 0,
  note: null,
});

const RATE_FIELDS = ['tier1_rate', 'tier2_rate', 'tier3_rate'];
const AMOUNT_FIELDS = ['tier1_max', 'tier2_max', 'base_salary', 'team_threshold', 'team_bonus'];
const RULE_FIELDS = [...RATE_FIELDS, ...AMOUNT_FIELDS];

function toManagerRule(row) {
  const rule = { ...DEFAULT_MANAGER_RULE };
  if (!row) return rule;
  for (const field of RULE_FIELDS) rule[field] = num(row[field]);
  rule.effective_period = row.effective_period || null;
  rule.note = row.note || null;
  rule.updated_by = row.updated_by ? Number(row.updated_by) : null;
  rule.updated_at = row.updated_at || null;
  return rule;
}

async function resolveManagerRule(db, period) {
  const [rows] = await db.query(
    'SELECT * FROM manager_commission_rule_versions WHERE effective_period <= ? ORDER BY effective_period DESC LIMIT 1',
    [String(period)]
  );
  return toManagerRule(rows[0]);
}

// 团队回款阶梯：全额单费率，非超额累进
function rateForTeamAmount(rule, amount) {
  const value = num(amount);
  if (value <= num(rule.tier1_max)) return num(rule.tier1_rate);
  if (value <= num(rule.tier2_max)) return num(rule.tier2_rate);
  return num(rule.tier3_rate);
}

function validateManagerRuleInput(body = {}, base = DEFAULT_MANAGER_RULE) {
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
  if (body.note !== undefined) data.note = String(body.note || '').slice(0, 500);

  const merged = { ...base, ...data };
  if (!(merged.tier1_max > 0) || !(merged.tier1_max < merged.tier2_max)) {
    const error = new Error('invalid_amount_bands');
    error.status = 400;
    throw error;
  }
  return data;
}

module.exports = {
  DEFAULT_MANAGER_RULE,
  RULE_FIELDS,
  toManagerRule,
  resolveManagerRule,
  rateForTeamAmount,
  validateManagerRuleInput,
  currentPeriod,
  assertPeriod,
};
