'use strict';

const { withTransaction, enqueueEvent } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');
const { salesScopeFor, scopeClause, num, parseJson } = require('../../lib/scope');

const MANAGER_ROLES = ['super_admin', 'sales_manager'];
const CONSTRUCTION_ITEM_NAME = '施工费用';

function textOf(value) {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function toSurvey(row) {
  return {
    ...row,
    id: Number(row.id),
    customer_id: Number(row.customer_id),
    quote_id: row.quote_id ? Number(row.quote_id) : null,
    scenario_id: row.scenario_id ? Number(row.scenario_id) : null,
    engineer_id: row.engineer_id ? Number(row.engineer_id) : null,
    created_by: Number(row.created_by),
    reviewed_by: row.reviewed_by ? Number(row.reviewed_by) : null,
    completion_reviewed_by: row.completion_reviewed_by ? Number(row.completion_reviewed_by) : null,
    roof_area: row.roof_area === null ? null : num(row.roof_area),
    monthly_consumption: row.monthly_consumption === null ? null : num(row.monthly_consumption),
    construction_cost: row.construction_cost === null ? null : num(row.construction_cost),
    order_id: row.order_id ? Number(row.order_id) : null,
    payload: parseJson(row.payload, {}),
  };
}

// 出发/完成时间必填，且完成时间必须晚于出发时间
function timeRangeError(departureAt, finishAt) {
  if (!departureAt) return 'departure_at_required';
  if (!finishAt) return 'finish_at_required';
  const departure = new Date(String(departureAt).replace(' ', 'T'));
  const finish = new Date(String(finishAt).replace(' ', 'T'));
  if (Number.isNaN(departure.getTime()) || Number.isNaN(finish.getTime())) return 'invalid_survey_time';
  if (finish.getTime() <= departure.getTime()) return 'finish_at_after_departure';
  return null;
}

function isManager(user) {
  return MANAGER_ROLES.includes(user.role);
}

function isAssignedEngineer(survey, user) {
  return survey.engineer_id && Number(survey.engineer_id) === Number(user.id);
}

// 踏勘人员本人或超级管理员可操作
function assertEngineerOperator(ctx, survey) {
  if (isAssignedEngineer(survey, ctx.state.user) || ctx.state.user.role === 'super_admin') return;
  ctx.throw(403, 'forbidden');
}

module.exports = {
  async list(ctx) {
    const params = [];
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    let where = `FROM surveys s
                 LEFT JOIN customers c ON c.id = s.customer_id
                 LEFT JOIN scenarios sc ON sc.id = s.scenario_id
                 LEFT JOIN quotes q ON q.id = s.quote_id WHERE 1 = 1`;
    where += scopeClause('c.owner_id', salesScopeFor(ctx.state.user), params);
    if (ctx.query.status) { where += ' AND s.status = ?'; params.push(String(ctx.query.status)); }
    if (q) { where += ' AND (c.name LIKE ? OR s.address LIKE ? OR q.quote_no LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const [countRows] = await ctx.app.db.query(`SELECT COUNT(*) AS total ${where}`, params);
    const [rows] = await ctx.app.db.query(
      `SELECT s.*, c.name AS customer_name, sc.scenario_no AS scenario_no, q.quote_no AS quote_no
       ${where} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
      params.concat([pageSize, (page - 1) * pageSize])
    );
    ctx.body = { surveys: rows.map(toSurvey), total: Number(countRows[0].total), page, page_size: pageSize };
  },

  // 新建勘测必须关联报价，客户与用电场景从报价带出
  async create(ctx) {
    const body = ctx.request.body || {};
    const quoteId = Number(body.quote_id);
    if (!quoteId) ctx.throw(400, 'quote_required');
    const [quotes] = await ctx.app.db.query(
      'SELECT id, customer_id, scenario_id FROM quotes WHERE id = ?', [quoteId]
    );
    if (!quotes.length) ctx.throw(404, 'quote_not_found');
    const quote = quotes[0];
    const customerId = Number(quote.customer_id);
    const [customers] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customers.length) ctx.throw(404, 'customer_not_found');
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(customers[0].owner_id))) ctx.throw(403, 'forbidden');
    const timeError = timeRangeError(body.departure_at, body.finish_at);
    if (timeError) ctx.throw(400, timeError);
    const [result] = await ctx.app.db.query(
      `INSERT INTO surveys (customer_id, quote_id, scenario_id, address, roof_type, roof_area, monthly_consumption,
        payload, status, created_by, created_by_name, departure_at, finish_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [customerId, quoteId, quote.scenario_id ? Number(quote.scenario_id) : null,
        body.address || customers[0].address || null, body.roof_type || null,
        body.roof_area === undefined ? null : Number(body.roof_area),
        body.monthly_consumption === undefined ? null : Number(body.monthly_consumption),
        JSON.stringify(body.payload || {}), 'draft', Number(ctx.state.user.id), ctx.state.user.name || null,
        body.departure_at, body.finish_at]
    );
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [result.insertId]);
    ctx.status = 201;
    ctx.body = { survey: toSurvey(rows[0]) };
  },

  // 申请现场踏勘：必须有报价、出发时间与完成时间；被驳回的勘测可重新申请
  async submit(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    const survey = rows[0];
    if (!['draft', 'invalid'].includes(survey.status)) ctx.throw(409, 'survey_not_draft');
    if (Number(survey.created_by) !== Number(ctx.state.user.id) && !isManager(ctx.state.user)) {
      ctx.throw(403, 'forbidden');
    }
    if (!survey.quote_id) ctx.throw(400, 'quote_required');
    const timeError = timeRangeError(survey.departure_at, survey.finish_at);
    if (timeError) ctx.throw(400, timeError);
    await ctx.app.db.query("UPDATE surveys SET status = 'submitted', submitted_at = NOW() WHERE id = ?", [id]);
    ctx.body = { id, status: 'submitted' };
  },

  // 审核：submitted 为踏勘申请审核；completion_pending 为完成踏勘审核
  async review(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const decision = String(body.decision || '');
    if (!['valid', 'invalid'].includes(decision)) ctx.throw(400, 'invalid_decision');
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    const survey = rows[0];

    // 完成踏勘审核：通过则完成，驳回则回到施工中
    if (survey.status === 'completion_pending') {
      const approved = decision === 'valid';
      await ctx.app.db.query(
        `UPDATE surveys SET status = ?, completed_at = ?, completion_reviewed_by = ?,
          completion_reviewed_by_name = ?, completion_review_note = ?, completion_reviewed_at = NOW()
         WHERE id = ?`,
        [approved ? 'completed' : 'reviewed',
          approved ? new Date() : survey.completed_at,
          Number(ctx.state.user.id), ctx.state.user.name || null, body.note || null, id]
      );
      ctx.body = { id, status: approved ? 'completed' : 'reviewed' };
      return;
    }

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

  // 工程部经理指定踏勘工程师（电气/结构工程师）
  async assignEngineer(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const engineerId = Number(body.engineer_id);
    if (!engineerId) ctx.throw(400, 'engineer_required');
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    if (!['submitted', 'reviewed', 'invalid'].includes(rows[0].status)) ctx.throw(409, 'survey_not_assignable');
    await ctx.app.db.query(
      'UPDATE surveys SET engineer_id = ?, engineer_name = ? WHERE id = ?',
      [engineerId, body.engineer_name || null, id]
    );
    ctx.body = { id, engineer_id: engineerId, engineer_name: body.engineer_name || null };
  },

  // 踏勘人员填写施工费用 → 写入关联报价的施工费用项并重算报价总额
  async fillConstructionCost(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const cost = Number(body.construction_cost);
    if (!Number.isFinite(cost) || cost < 0) ctx.throw(400, 'invalid_construction_cost');
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    const survey = rows[0];
    if (!survey.quote_id) ctx.throw(400, 'quote_required');
    if (!['reviewed', 'completion_pending'].includes(survey.status)) ctx.throw(409, 'survey_not_reviewed');
    assertEngineerOperator(ctx, survey);

    const quoteId = Number(survey.quote_id);
    const [quotes] = await ctx.app.db.query('SELECT id, items FROM quotes WHERE id = ?', [quoteId]);
    if (!quotes.length) ctx.throw(404, 'quote_not_found');
    const items = parseJson(quotes[0].items, []);
    const existing = items.find((item) => String(item.name || '').trim() === CONSTRUCTION_ITEM_NAME);
    if (existing) {
      existing.qty = 1;
      existing.unit_price = cost;
    } else {
      items.push({ name: CONSTRUCTION_ITEM_NAME, qty: 1, unit_price: cost });
    }
    const total = Math.round(items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0) * 100) / 100;

    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query(
        'UPDATE surveys SET construction_cost = ? WHERE id = ?', [cost, id]
      );
      await connection.query(
        'UPDATE quotes SET items = ?, total_amount = ? WHERE id = ?',
        [JSON.stringify(items), total, quoteId]
      );
    });
    ctx.body = { id, construction_cost: cost, quote_id: quoteId, quote_total: total };
  },

  // 踏勘人员申请完成踏勘（需先填写施工费用），由超管/销售经理审核
  async requestCompletion(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    const survey = rows[0];
    if (survey.status !== 'reviewed') ctx.throw(409, 'survey_not_reviewed');
    if (survey.construction_cost === null || survey.construction_cost === undefined) {
      ctx.throw(409, 'construction_cost_required');
    }
    assertEngineerOperator(ctx, survey);
    await ctx.app.db.query("UPDATE surveys SET status = 'completion_pending' WHERE id = ?", [id]);
    ctx.body = { id, status: 'completion_pending' };
  },

  // 已完成的踏勘可申请重新踏勘（重新填写出发/完成时间），需再次审核
  async resurvey(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    const survey = rows[0];
    if (survey.status !== 'completed') ctx.throw(409, 'survey_not_completed');
    if (!survey.quote_id) ctx.throw(400, 'quote_required');
    if (Number(survey.created_by) !== Number(ctx.state.user.id) && !isManager(ctx.state.user)) {
      ctx.throw(403, 'forbidden');
    }
    const timeError = timeRangeError(body.departure_at, body.finish_at);
    if (timeError) ctx.throw(400, timeError);
    await ctx.app.db.query(
      `UPDATE surveys SET status = 'submitted', submitted_at = NOW(), departure_at = ?, finish_at = ?,
        completed_at = NULL, reviewed_by = NULL, reviewed_at = NULL, review_note = NULL,
        completion_reviewed_by = NULL, completion_reviewed_by_name = NULL,
        completion_review_note = NULL, completion_reviewed_at = NULL
       WHERE id = ?`,
      [body.departure_at, body.finish_at, id]
    );
    ctx.body = { id, status: 'submitted' };
  },

  async remove(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM surveys WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'survey_not_found');
    await ctx.app.db.query('DELETE FROM surveys WHERE id = ?', [id]);
    ctx.body = { id, deleted: true };
  },
};
