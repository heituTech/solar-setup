'use strict';

const crypto = require('crypto');
const { salesScopeFor, num } = require('../../lib/scope');

const GRID_TYPES = ['on_grid', 'off_grid', 'hybrid'];
const INSTALL_TYPES = ['rooftop', 'ground'];
const SCENE_TYPES = ['residential', 'cafe', 'restaurant', 'supermarket', 'hotel'];

function newNo(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function toScenario(row) {
  return {
    ...row,
    id: Number(row.id),
    customer_id: Number(row.customer_id),
    monthly_kwh: row.monthly_kwh === null ? null : num(row.monthly_kwh),
    area_sqm: row.area_sqm === null ? null : num(row.area_sqm),
    peak_load_kw: row.peak_load_kw === null ? null : num(row.peak_load_kw),
    day_kwh: row.day_kwh === null ? null : num(row.day_kwh),
    night_kwh: row.night_kwh === null ? null : num(row.night_kwh),
    created_by: row.created_by ? Number(row.created_by) : null,
  };
}

async function assertCustomerAccess(ctx, customerId) {
  const [rows] = await ctx.app.db.query('SELECT id, owner_id FROM customers WHERE id = ?', [customerId]);
  if (!rows.length) ctx.throw(404, 'customer_not_found');
  const scope = salesScopeFor(ctx.state.user);
  if (scope !== null && !scope.includes(Number(rows[0].owner_id))) ctx.throw(403, 'forbidden');
  return rows[0];
}

module.exports = {
  async list(ctx) {
    const customerId = Number(ctx.params.customerId);
    await assertCustomerAccess(ctx, customerId);
    const [rows] = await ctx.app.db.query(
      'SELECT * FROM scenarios WHERE customer_id = ? ORDER BY id DESC', [customerId]
    );
    ctx.body = { scenarios: rows.map(toScenario) };
  },

  async detail(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM scenarios WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'scenario_not_found');
    await assertCustomerAccess(ctx, Number(rows[0].customer_id));
    ctx.body = { scenario: toScenario(rows[0]) };
  },

  async create(ctx) {
    const customerId = Number(ctx.params.customerId);
    await assertCustomerAccess(ctx, customerId);
    const body = ctx.request.body || {};
    if (!GRID_TYPES.includes(body.grid_type)) ctx.throw(400, 'invalid_grid_type');
    if (!INSTALL_TYPES.includes(body.install_type)) ctx.throw(400, 'invalid_install_type');
    if (!SCENE_TYPES.includes(body.scene_type)) ctx.throw(400, 'invalid_scene_type');
    const [result] = await ctx.app.db.query(
      `INSERT INTO scenarios (scenario_no, customer_id, grid_type, install_type, scene_type,
        monthly_kwh, area_sqm, peak_load_kw, day_kwh, night_kwh, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [newNo('SC'), customerId, body.grid_type, body.install_type, body.scene_type,
        body.monthly_kwh ?? null, body.area_sqm ?? null, body.peak_load_kw ?? null,
        body.day_kwh ?? null, body.night_kwh ?? null, body.notes || null,
        Number(ctx.state.user.id)]
    );
    const [rows] = await ctx.app.db.query('SELECT * FROM scenarios WHERE id = ?', [result.insertId]);
    ctx.status = 201;
    ctx.body = { scenario: toScenario(rows[0]) };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM scenarios WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'scenario_not_found');
    await assertCustomerAccess(ctx, Number(rows[0].customer_id));
    const body = ctx.request.body || {};
    const fields = [];
    const params = [];
    for (const k of ['grid_type', 'install_type', 'scene_type', 'monthly_kwh', 'area_sqm',
      'peak_load_kw', 'day_kwh', 'night_kwh', 'notes']) {
      if (body[k] !== undefined) { fields.push(`${k} = ?`); params.push(body[k]); }
    }
    if (fields.length) {
      await ctx.app.db.query(`UPDATE scenarios SET ${fields.join(', ')} WHERE id = ?`, params.concat([id]));
    }
    const [updated] = await ctx.app.db.query('SELECT * FROM scenarios WHERE id = ?', [id]);
    ctx.body = { scenario: toScenario(updated[0]) };
  },

  async remove(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM scenarios WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'scenario_not_found');
    await assertCustomerAccess(ctx, Number(rows[0].customer_id));
    await ctx.app.db.query('DELETE FROM system_configs WHERE scenario_id = ?', [id]);
    await ctx.app.db.query('DELETE FROM scenarios WHERE id = ?', [id]);
    ctx.body = { id, deleted: true };
  },
};
