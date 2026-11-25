'use strict';

const {
  DEFAULT_MANAGER_RULE, toManagerRule, resolveManagerRule, currentPeriod, assertPeriod,
  validateManagerRuleInput,
} = require('../../lib/manager-commission-rules');

const UPSERT_FIELDS = [
  'tier1_max', 'tier1_rate', 'tier2_max', 'tier2_rate', 'tier3_rate',
  'base_salary', 'team_threshold', 'team_bonus', 'note',
];

module.exports = {
  async list(ctx) {
    const [rows] = await ctx.app.db.query(
      'SELECT * FROM manager_commission_rule_versions ORDER BY effective_period DESC'
    );
    ctx.body = {
      rules: rows.map(toManagerRule),
      defaults: DEFAULT_MANAGER_RULE,
      current_period: currentPeriod(),
    };
  },

  async resolve(ctx) {
    const period = String(ctx.query.period || currentPeriod());
    assertPeriod(period, true);
    ctx.body = { period, rule: await resolveManagerRule(ctx.app.db, period) };
  },

  async save(ctx) {
    const period = String(ctx.params.period || '');
    assertPeriod(period, false);
    const baseRule = await resolveManagerRule(ctx.app.db, period);
    const data = validateManagerRuleInput(ctx.request.body || {}, baseRule);
    if (!Object.keys(data).length) ctx.throw(400, 'no_fields');
    // 未传字段沿用该月份当前生效规则，保证每个月份版本参数完整
    const valueOf = (field) => (data[field] === undefined ? baseRule[field] : data[field]);
    const columns = ['effective_period', ...UPSERT_FIELDS, 'created_by', 'updated_by'];
    const placeholders = columns.map(() => '?').join(',');
    const assignments = UPSERT_FIELDS.map((field) => `${field} = VALUES(${field})`);
    assignments.push('updated_by = VALUES(updated_by)');
    await ctx.app.db.query(
      `INSERT INTO manager_commission_rule_versions (${columns.join(',')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${assignments.join(', ')}`,
      [period, ...UPSERT_FIELDS.map(valueOf), Number(ctx.state.user.id), Number(ctx.state.user.id)]
    );
    ctx.body = { period, rule: await resolveManagerRule(ctx.app.db, period) };
  },
};
