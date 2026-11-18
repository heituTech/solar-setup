'use strict';

const {
  DEFAULT_RULE, toRule, resolveRule, currentPeriod, assertPeriod, validateRuleInput,
} = require('../../lib/commission-rules');

const UPSERT_FIELDS = [
  'retail_rate', 'band_retail_max', 'engineering_rate_low', 'band_engineering_low_max',
  'engineering_rate_mid', 'band_engineering_mid_max', 'engineering_rate_high',
  'first_stage_ratio', 'first_stage_threshold', 'final_stage_ratio', 'referral_rate',
  'referral_exclusive', 'first_order_reward', 'survey_threshold', 'survey_reward',
  'base_salary', 'champion_reward', 'champion_basis', 'note',
];

module.exports = {
  async list(ctx) {
    const [rows] = await ctx.app.db.query(
      'SELECT * FROM commission_rule_versions ORDER BY effective_period DESC'
    );
    ctx.body = {
      rules: rows.map(toRule),
      defaults: DEFAULT_RULE,
      current_period: currentPeriod(),
    };
  },

  async resolve(ctx) {
    const period = String(ctx.query.period || currentPeriod());
    assertPeriod(period, true);
    ctx.body = { period, rule: await resolveRule(ctx.app.db, period) };
  },

  async save(ctx) {
    const period = String(ctx.params.period || '');
    assertPeriod(period, false);
    const baseRule = await resolveRule(ctx.app.db, period);
    const data = validateRuleInput(ctx.request.body || {}, baseRule);
    if (!Object.keys(data).length) ctx.throw(400, 'no_fields');
    // 未传字段沿用该月份当前生效规则，保证每个月份版本参数完整
    const valueOf = (field) => (data[field] === undefined ? baseRule[field] : data[field]);
    const columns = ['effective_period', ...UPSERT_FIELDS, 'created_by', 'updated_by'];
    const placeholders = columns.map(() => '?').join(',');
    const assignments = UPSERT_FIELDS.map((field) => `${field} = VALUES(${field})`);
    assignments.push('updated_by = VALUES(updated_by)');
    await ctx.app.db.query(
      `INSERT INTO commission_rule_versions (${columns.join(',')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${assignments.join(', ')}`,
      [period, ...UPSERT_FIELDS.map(valueOf), Number(ctx.state.user.id), Number(ctx.state.user.id)]
    );
    ctx.body = { period, rule: await resolveRule(ctx.app.db, period) };
  },
};
