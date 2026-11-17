'use strict';

const { withTransaction, enqueueEvent } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');

const APPROVAL_TYPES = new Set(['product_change', 'quote_discount']);

module.exports = {
  async list(ctx) {
    const user = ctx.state.user;
    const params = [];
    let sql = `SELECT id,type,requester_id,requester_name,payload,status,approver_id,decision_note,created_at,decided_at
               FROM approval_requests`;
    if (user.role === 'super_admin' || user.role === 'accountant') {
      sql += ' WHERE 1 = 1';
    } else if (user.role === 'sales_manager') {
      const team = [Number(user.id), ...(user.salesperson_ids || [])];
      sql += ` WHERE requester_id IN (${team.map(() => '?').join(',')})`;
      params.push(...team);
    } else {
      sql += ' WHERE requester_id = ?';
      params.push(Number(user.id));
    }
    sql += ' ORDER BY id DESC LIMIT 200';
    const [rows] = await ctx.app.db.query(sql, params);
    ctx.body = {
      approvals: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        requester_id: Number(row.requester_id),
        approver_id: row.approver_id ? Number(row.approver_id) : null,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      })),
    };
  },

  async create(ctx) {
    const user = ctx.state.user;
    if (!['salesperson', 'sales_manager'].includes(user.role)) ctx.throw(403, 'forbidden');
    const body = ctx.request.body || {};
    const type = String(body.type || '');
    if (!APPROVAL_TYPES.has(type)) ctx.throw(400, 'invalid_approval_type');
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const [result] = await ctx.app.db.query(
      'INSERT INTO approval_requests (type, requester_id, requester_name, payload, status) VALUES (?,?,?,?,?)',
      [type, Number(user.id), user.name, JSON.stringify(payload), 'pending']
    );
    ctx.status = 201;
    ctx.body = { id: Number(result.insertId), status: 'pending' };
  },

  async decide(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const decision = String(body.decision || '');
    if (!['approved', 'rejected'].includes(decision)) ctx.throw(400, 'invalid_decision');
    const [rows] = await ctx.app.db.query('SELECT * FROM approval_requests WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'approval_not_found');
    const request = rows[0];
    if (request.status !== 'pending') ctx.throw(409, 'approval_already_decided');
    if (ctx.state.user.role !== 'super_admin' && Number(request.requester_id) === Number(ctx.state.user.id)) {
      ctx.throw(403, 'cannot_approve_own_request');
    }
    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query(
        "UPDATE approval_requests SET status = ?, approver_id = ?, decision_note = ?, decided_at = NOW() WHERE id = ? AND status = 'pending'",
        [decision, Number(ctx.state.user.id), body.note ? String(body.note).slice(0, 500) : null, id]
      );
      await enqueueEvent(connection, {
        type: EVENTS.APPROVAL_DECIDED,
        aggregateId: id,
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales'],
        payload: {
          approval_id: id,
          approval_type: request.type,
          decision,
          requester_id: Number(request.requester_id),
          request_payload: typeof request.payload === 'string' ? JSON.parse(request.payload) : request.payload,
        },
      });
    });
    ctx.body = { id, status: decision };
  },

  async flows(ctx) {
    const [rows] = await ctx.app.db.query('SELECT id,code,name,steps FROM approval_flows ORDER BY id');
    ctx.body = {
      flows: rows.map((row) => ({ ...row, steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps })),
    };
  },
};
