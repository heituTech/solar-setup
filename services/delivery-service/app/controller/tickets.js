'use strict';

const { withTransaction, enqueueEvent } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');

const STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

function toTicket(row) {
  return {
    ...row,
    id: Number(row.id),
    project_id: row.project_id ? Number(row.project_id) : null,
    order_id: row.order_id ? Number(row.order_id) : null,
    customer_id: row.customer_id ? Number(row.customer_id) : null,
    assignee_id: row.assignee_id ? Number(row.assignee_id) : null,
  };
}

module.exports = {
  async list(ctx) {
    const params = [];
    let sql = 'SELECT * FROM tickets WHERE 1 = 1';
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(String(ctx.query.status)); }
    if (ctx.query.project_id) { sql += ' AND project_id = ?'; params.push(Number(ctx.query.project_id)); }
    sql += ' ORDER BY id DESC LIMIT 300';
    const [rows] = await ctx.app.db.query(sql, params);
    ctx.body = { tickets: rows.map(toTicket) };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const title = String(body.title || '').trim();
    if (!title) ctx.throw(400, 'title_required');
    let project = null;
    if (body.project_id) {
      const [rows] = await ctx.app.db.query('SELECT * FROM projects WHERE id = ?', [Number(body.project_id)]);
      if (!rows.length) ctx.throw(404, 'project_not_found');
      project = rows[0];
    }
    const priority = body.priority || 'normal';
    if (!PRIORITIES.has(priority)) ctx.throw(400, 'invalid_priority');
    const ticket = await withTransaction(ctx.app.db, async (connection) => {
      const [result] = await connection.query(
        `INSERT INTO tickets (project_id, order_id, customer_id, customer_name, title, description, priority, status, assignee_id, assignee_name, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [project ? Number(project.id) : null, project ? Number(project.order_id) : null,
          project ? Number(project.customer_id) : null, project ? project.customer_name : (body.customer_name || null),
          title, body.description || null, priority, 'open',
          body.assignee_id ? Number(body.assignee_id) : null, body.assignee_name || null, Number(ctx.state.user.id)]
      );
      await enqueueEvent(connection, {
        type: EVENTS.TICKET_CHANGED,
        aggregateId: result.insertId,
        customerId: project ? Number(project.customer_id) : null,
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales'],
        payload: { ticket_id: Number(result.insertId), order_id: project ? Number(project.order_id) : null, status: 'open', title },
      });
      const [rows] = await connection.query('SELECT * FROM tickets WHERE id = ?', [result.insertId]);
      return rows[0];
    });
    ctx.status = 201;
    ctx.body = { ticket: toTicket(ticket) };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'ticket_not_found');
    const body = ctx.request.body || {};
    if (body.status && !STATUSES.has(String(body.status))) ctx.throw(400, 'invalid_status');
    const ticket = await withTransaction(ctx.app.db, async (connection) => {
      const assignments = [];
      const params = [];
      for (const field of ['status', 'resolution', 'assignee_name']) {
        if (body[field] !== undefined) { assignments.push(`${field} = ?`); params.push(body[field]); }
      }
      if (body.assignee_id !== undefined) {
        assignments.push('assignee_id = ?');
        params.push(body.assignee_id ? Number(body.assignee_id) : null);
      }
      if (!assignments.length) ctx.throw(400, 'no_fields');
      params.push(id);
      await connection.query(`UPDATE tickets SET ${assignments.join(', ')} WHERE id = ?`, params);
      await enqueueEvent(connection, {
        type: EVENTS.TICKET_CHANGED,
        aggregateId: id,
        customerId: rows[0].customer_id ? Number(rows[0].customer_id) : null,
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales'],
        payload: { ticket_id: id, order_id: rows[0].order_id ? Number(rows[0].order_id) : null, status: body.status || rows[0].status },
      });
      const [fresh] = await connection.query('SELECT * FROM tickets WHERE id = ?', [id]);
      return fresh[0];
    });
    ctx.body = { ticket: toTicket(ticket) };
  },
};
