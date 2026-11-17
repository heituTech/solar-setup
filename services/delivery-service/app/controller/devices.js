'use strict';

const STATUSES = new Set(['pending', 'in_stock', 'delivered', 'installed', 'accepted']);

function toDevice(row) {
  return { ...row, id: Number(row.id), project_id: Number(row.project_id), quantity: Number(row.quantity) };
}

module.exports = {
  async list(ctx) {
    const params = [];
    let sql = 'SELECT * FROM devices WHERE 1 = 1';
    if (ctx.query.project_id) { sql += ' AND project_id = ?'; params.push(Number(ctx.query.project_id)); }
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(String(ctx.query.status)); }
    sql += ' ORDER BY project_id DESC, id LIMIT 500';
    const [rows] = await ctx.app.db.query(sql, params);
    ctx.body = { devices: rows.map(toDevice) };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const projectId = Number(body.project_id);
    const [projects] = await ctx.app.db.query('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!projects.length) ctx.throw(404, 'project_not_found');
    if (!body.category || !body.model || !body.name) ctx.throw(400, 'category_model_name_required');
    const status = body.status || 'pending';
    if (!STATUSES.has(status)) ctx.throw(400, 'invalid_status');
    const [result] = await ctx.app.db.query(
      `INSERT INTO devices (project_id, category, model, name, serial_no, quantity, status, warehouse_note)
       VALUES (?,?,?,?,?,?,?,?)`,
      [projectId, String(body.category), String(body.model), String(body.name), body.serial_no || null,
        Number(body.quantity || 1), status, body.warehouse_note || null]
    );
    const [rows] = await ctx.app.db.query('SELECT * FROM devices WHERE id = ?', [result.insertId]);
    ctx.status = 201;
    ctx.body = { device: toDevice(rows[0]) };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM devices WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'device_not_found');
    const body = ctx.request.body || {};
    if (body.status && !STATUSES.has(String(body.status))) ctx.throw(400, 'invalid_status');
    const assignments = [];
    const params = [];
    for (const field of ['status', 'serial_no', 'warehouse_note']) {
      if (body[field] !== undefined) { assignments.push(`${field} = ?`); params.push(body[field]); }
    }
    if (body.quantity !== undefined) { assignments.push('quantity = ?'); params.push(Number(body.quantity)); }
    if (!assignments.length) ctx.throw(400, 'no_fields');
    params.push(id);
    await ctx.app.db.query(`UPDATE devices SET ${assignments.join(', ')} WHERE id = ?`, params);
    const [fresh] = await ctx.app.db.query('SELECT * FROM devices WHERE id = ?', [id]);
    ctx.body = { device: toDevice(fresh[0]) };
  },
};
