'use strict';

const { withTransaction, enqueueEvent } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');
const { salesScopeFor, scopeClause, num, parseJson } = require('../../lib/scope');

function textOf(value) {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function toSurvey(row) {
  return {
    ...row,
    id: Number(row.id),
    customer_id: Number(row.customer_id),
    created_by: Number(row.created_by),
    reviewed_by: row.reviewed_by ? Number(row.reviewed_by) : null,
    roof_area: row.roof_area === null ? null : num(row.roof_area),
    monthly_consumption: row.monthly_consumption === null ? null : num(row.monthly_consumption),
    construction_cost: row.construction_cost === null ? null : num(row.construction_cost),
    order_id: row.order_id ? Number(row.order_id) : null,
    payload: parseJson(row.payload, {}),
  };
}

module.exports = {
  async list(ctx) {
    const params = [];
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    let where = `FROM surveys s
                 LEFT JOIN customers c ON c.id = s.customer_id WHERE 1 = 1`;
    where += scopeClause('c.owner_id', salesScopeFor(ctx.state.user), params);
    if (ctx.query.status) { where += ' AND s.status = ?'; params.push(String(ctx.query.status)); }
    if (q) { where += ' AND (c.name LIKE ? OR s.address LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const [countRows] = await ctx.app.db.query(`SELECT COUNT(*) AS total ${where}`, params);
    const [rows] = await ctx.app.db.query(
      `SELECT s.*, c.name AS customer_name ${where} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
      params.concat([pageSize, (page - 1) * pageSize])
    );
    ctx.body = { surveys: rows.map(toSurvey), total: Number(countRows[0].total), page, page_size: pageSize };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const customerId = Number(body.customer_id);
    const [customers] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customers.length) ctx.throw(404, 'customer_not_found');
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(customers[0].owner_id))) ctx.throw(403, 'forbidden');
    const [result] = await ctx.app.db.query(
      `INSERT INTO surveys (customer_id, address, roof_type, roof_area, monthly_consumption, payload, status, created_by, created_by_name)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [customerId, body.address || customers[0].address || null, body.roof_type || null,
        body.roof_area === undefined ? null : Number(body.roof_area),
        body.monthly_consumption === undefined ? null : Number(body.monthly_consumption),
        JSON.stringify(body.payload || {}), 'draft', Number(ctx.state.user.id), ctx.state.user.name || null]
    );
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [result.insertId]);
    ctx.status = 201;
    ctx.body = { survey: toSurvey(rows[0]) };
  },

  async submit(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    if (rows[0].status !== 'draft') ctx.throw(409, 'survey_not_draft');
    if (Number(rows[0].created_by) !== Number(ctx.state.user.id) && !['super_admin', 'sales_manager'].includes(ctx.state.user.role)) {
      ctx.throw(403, 'forbidden');
    }
    await ctx.app.db.query("UPDATE surveys SET status = 'submitted', submitted_at = NOW() WHERE id = ?", [id]);
    ctx.body = { id, status: 'submitted' };
  },

  async review(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const decision = String(body.decision || '');
    if (!['valid', 'invalid'].includes(decision)) ctx.throw(400, 'invalid_decision');
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    const survey = rows[0];
    if (survey.status !== 'submitted') ctx.throw(409, 'survey_not_submitted');
    const [customers] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [survey.customer_id]);
    const customer = customers[0] || {};
    const data = parseJson(survey.payload, {});
    const isValid = decision === 'valid';
    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query(
        'UPDATE surveys SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = NOW() WHERE id = ?',
        [isValid ? 'reviewed' : 'invalid', Number(ctx.state.user.id), body.note || null, id]
      );
      await enqueueEvent(connection, {
        type: EVENTS.SURVEY_REVIEWED,
        aggregateId: id,
        customerId: Number(survey.customer_id),
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['finance'],
        payload: {
          survey_id: id,
          customer_id: Number(survey.customer_id),
          customer_name: customer.name || null,
          salesperson_id: Number(survey.created_by),
          salesperson_name: survey.created_by_name || null,
          address: survey.address || customer.address || null,
          photo_refs: textOf(data.photo_refs || data.photos),
          confirm_method: textOf(data.confirm_method || data.confirmation),
          requirement_summary: textOf(data.requirement_summary || data.requirements),
          is_valid: isValid,
          note: body.note || survey.review_note || null,
          survey_date: new Date(survey.created_at || Date.now()).toISOString().slice(0, 10),
        },
      });
    });
    ctx.body = { id, status: isValid ? 'reviewed' : 'invalid' };
  },

  // 踏勘人员填施工费用 → 回填到订单的施工费用行
  async fillConstructionCost(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const cost = Number(body.construction_cost);
    if (!Number.isFinite(cost) || cost < 0) ctx.throw(400, 'invalid_construction_cost');
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    const survey = rows[0];

    await ctx.app.db.query('UPDATE surveys SET construction_cost = ? WHERE id = ?', [cost, id]);

    // 如果有关联订单，回填到订单的施工费用行
    if (survey.order_id) {
      await ctx.app.db.query(
        "UPDATE order_items SET unit_price = ?, subtotal = ?, notes = ? WHERE order_id = ? AND item_type = 'construction'",
        [cost, cost, body.note || '踏勘后勘察人员已填写', survey.order_id]
      );
      // 重算订单总额
      const [sumRows] = await ctx.app.db.query(
        'SELECT COALESCE(SUM(subtotal),0) AS total FROM order_items WHERE order_id = ?', [survey.order_id]
      );
      await ctx.app.db.query('UPDATE orders SET amount = ? WHERE id = ?',
        [Math.round(num(sumRows[0].total) * 100) / 100, survey.order_id]);
    }
    ctx.body = { id, construction_cost: cost, order_id: survey.order_id || null };
  },

  // 把踏勘和订单关联（销售在订单详情里绑定）
  async linkOrder(ctx) {
    const id = Number(ctx.params.id);
    const orderId = Number((ctx.request.body || {}).order_id);
    if (!orderId) ctx.throw(400, 'order_id_required');
    const [surveys] = await ctx.app.db.query('SELECT id FROM surveys WHERE id = ?', [id]);
    if (!surveys.length) ctx.throw(404, 'survey_not_found');
    const [orders] = await ctx.app.db.query('SELECT id FROM orders WHERE id = ?', [orderId]);
    if (!orders.length) ctx.throw(404, 'order_not_found');
    await ctx.app.db.query('UPDATE surveys SET order_id = ? WHERE id = ?', [orderId, id]);
    ctx.body = { id, order_id: orderId };
  },

  async remove(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    await ctx.app.db.query('DELETE FROM surveys WHERE id = ?', [id]);
    ctx.body = { id, deleted: true };
  },
};
