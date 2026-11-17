'use strict';

const { num, salesScopeFor, scopeClause } = require('../../lib/finance');

const ADJUSTMENT_TYPES = new Set(['award', 'penalty', 'recover']);

module.exports = {
  async getConfig(ctx) {
    const [rows] = await ctx.app.db.query('SELECT * FROM compensation_config WHERE id = 1');
    const row = rows[0] || {};
    ctx.body = {
      config: {
        base_rate: num(row.base_rate),
        remaining_rate: num(row.remaining_rate),
        referral_rate: num(row.referral_rate),
        first_order_reward: num(row.first_order_reward),
        survey_reward: num(row.survey_reward),
        updated_at: row.updated_at || null,
      },
    };
  },

  async updateConfig(ctx) {
    const body = ctx.request.body || {};
    const fields = ['base_rate', 'remaining_rate', 'referral_rate', 'first_order_reward', 'survey_reward'];
    const assignments = [];
    const params = [];
    for (const field of fields) {
      if (body[field] === undefined) continue;
      const value = Number(body[field]);
      if (!Number.isFinite(value) || value < 0) ctx.throw(400, 'invalid_config_value');
      if (field.endsWith('_rate') && value > 1) ctx.throw(400, 'invalid_config_value');
      assignments.push(`${field} = ?`);
      params.push(value);
    }
    if (!assignments.length) ctx.throw(400, 'no_fields');
    params.push(Number(ctx.state.user.id));
    await ctx.app.db.query(
      `UPDATE compensation_config SET ${assignments.join(', ')}, updated_by = ? WHERE id = 1`,
      params
    );
    return module.exports.getConfig(ctx);
  },

  async listAdjustments(ctx) {
    const params = [];
    let sql = 'SELECT * FROM commission_adjustments WHERE 1 = 1';
    sql += scopeClause('salesperson_id', salesScopeFor(ctx.state.user), params);
    sql += ' ORDER BY id DESC LIMIT 300';
    const [rows] = await ctx.app.db.query(sql, params);
    ctx.body = {
      adjustments: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        order_id: row.order_id ? Number(row.order_id) : null,
        salesperson_id: Number(row.salesperson_id),
        amount: num(row.amount),
      })),
    };
  },

  async createAdjustment(ctx) {
    const body = ctx.request.body || {};
    const salespersonId = Number(body.salesperson_id);
    const type = String(body.type || '');
    const amount = Number(body.amount);
    const reason = String(body.reason || '').trim();
    if (!salespersonId) ctx.throw(400, 'salesperson_id_required');
    if (!ADJUSTMENT_TYPES.has(type)) ctx.throw(400, 'invalid_adjustment_type');
    if (!Number.isFinite(amount) || amount <= 0) ctx.throw(400, 'invalid_amount');
    if (!reason) ctx.throw(400, 'reason_required');
    const [result] = await ctx.app.db.query(
      `INSERT INTO commission_adjustments (order_id, salesperson_id, type, amount, reason, created_by)
       VALUES (?,?,?,?,?,?)`,
      [body.order_id ? Number(body.order_id) : null, salespersonId, type, amount, reason, Number(ctx.state.user.id)]
    );
    ctx.status = 201;
    ctx.body = { id: Number(result.insertId) };
  },
};
