'use strict';

const { withTransaction, enqueueEvent } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');

function num(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function scopeFor(user) {
  if (user.role === 'salesperson') return { column: 'salesperson_id', ids: [Number(user.id)] };
  if (user.role === 'sales_manager') {
    return { column: 'salesperson_id', ids: [Number(user.id), ...(user.salesperson_ids || []).map(Number)] };
  }
  if (user.role === 'electrical_engineer') return { column: 'electrical_engineer_id', ids: [Number(user.id)] };
  if (user.role === 'structural_engineer') return { column: 'structural_engineer_id', ids: [Number(user.id)] };
  return null;
}

function toProject(row) {
  return {
    ...row,
    id: Number(row.id),
    order_id: Number(row.order_id),
    customer_id: Number(row.customer_id),
    salesperson_id: row.salesperson_id ? Number(row.salesperson_id) : null,
    electrical_engineer_id: row.electrical_engineer_id ? Number(row.electrical_engineer_id) : null,
    structural_engineer_id: row.structural_engineer_id ? Number(row.structural_engineer_id) : null,
    amount: num(row.amount),
  };
}

async function assertAccess(ctx, project) {
  const scope = scopeFor(ctx.state.user);
  if (scope === null) return;
  if (!scope.ids.includes(Number(project[scope.column]))) ctx.throw(403, 'forbidden');
}

async function loadProject(ctx, id, connection = ctx.app.db) {
  const [rows] = await connection.query('SELECT * FROM projects WHERE id = ?', [id]);
  if (!rows.length) ctx.throw(404, 'project_not_found');
  return rows[0];
}

module.exports = {
  async list(ctx) {
    const params = [];
    let sql = 'SELECT * FROM projects WHERE 1 = 1';
    const scope = scopeFor(ctx.state.user);
    if (scope) {
      if (!scope.ids.length) { sql += ' AND 1 = 0'; } else {
        sql += ` AND ${scope.column} IN (${scope.ids.map(() => '?').join(',')})`;
        params.push(...scope.ids);
      }
    }
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(String(ctx.query.status)); }
    sql += ' ORDER BY id DESC LIMIT 300';
    const [rows] = await ctx.app.db.query(sql, params);
    ctx.body = { projects: rows.map(toProject) };
  },

  async detail(ctx) {
    const project = await loadProject(ctx, Number(ctx.params.id));
    await assertAccess(ctx, project);
    const [devices] = await ctx.app.db.query('SELECT * FROM devices WHERE project_id = ? ORDER BY id', [project.id]);
    const [progress] = await ctx.app.db.query('SELECT * FROM project_progress WHERE project_id = ? ORDER BY id DESC', [project.id]);
    const [tickets] = await ctx.app.db.query('SELECT * FROM tickets WHERE project_id = ? ORDER BY id DESC', [project.id]);
    ctx.body = {
      project: toProject(project),
      devices: devices.map((row) => ({ ...row, id: Number(row.id), project_id: Number(row.project_id), quantity: Number(row.quantity) })),
      progress,
      tickets,
    };
  },

  async assign(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const project = await loadProject(ctx, id);
    if (project.status === 'accepted') ctx.throw(409, 'project_already_accepted');
    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query(
        `UPDATE projects SET electrical_engineer_id = ?, electrical_engineer_name = ?,
         structural_engineer_id = ?, structural_engineer_name = ?, status = 'initializing' WHERE id = ?`,
        [body.electrical_engineer_id ? Number(body.electrical_engineer_id) : null, body.electrical_engineer_name || null,
          body.structural_engineer_id ? Number(body.structural_engineer_id) : null, body.structural_engineer_name || null, id]
      );
      await enqueueEvent(connection, {
        type: EVENTS.PROJECT_PROGRESS_CHANGED,
        aggregateId: id,
        customerId: Number(project.customer_id),
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales'],
        payload: { project_id: id, order_id: Number(project.order_id), status: 'initializing', stage: 'assigned' },
      });
    });
    ctx.body = { project: toProject(await loadProject(ctx, id)) };
  },

  async progress(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const stage = String(body.stage || '').trim();
    if (!stage) ctx.throw(400, 'stage_required');
    const project = await loadProject(ctx, id);
    await assertAccess(ctx, project);
    if (project.status === 'accepted') ctx.throw(409, 'project_already_accepted');
    const start = stage === 'start';
    const status = start ? 'in_delivery' : (project.status === 'pending_assignment' ? 'pending_assignment' : project.status);
    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query(
        'INSERT INTO project_progress (project_id, stage, note, actor_id, actor_name) VALUES (?,?,?,?,?)',
        [id, stage, body.note || null, Number(ctx.state.user.id), ctx.state.user.name]
      );
      await connection.query(
        `UPDATE projects SET status = ?, started_at = ${start ? 'COALESCE(started_at, NOW())' : 'started_at'} WHERE id = ?`,
        [status, id]
      );
      await enqueueEvent(connection, {
        type: EVENTS.PROJECT_PROGRESS_CHANGED,
        aggregateId: id,
        customerId: Number(project.customer_id),
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales'],
        payload: { project_id: id, order_id: Number(project.order_id), status, stage, note: body.note || null },
      });
    });
    ctx.body = { project: toProject(await loadProject(ctx, id)) };
  },

  async accept(ctx) {
    const id = Number(ctx.params.id);
    const project = await loadProject(ctx, id);
    await assertAccess(ctx, project);
    if (project.status !== 'in_delivery') ctx.throw(409, 'project_not_in_delivery');
    const acceptedAt = new Date();
    const acceptedAtSql = acceptedAt.toISOString().slice(0, 19).replace('T', ' ');
    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query("UPDATE projects SET status = 'accepted', accepted_at = ? WHERE id = ?", [acceptedAt, id]);
      await connection.query(
        'INSERT INTO project_progress (project_id, stage, note, actor_id, actor_name) VALUES (?,?,?,?,?)',
        [id, 'accepted', (ctx.request.body || {}).note || null, Number(ctx.state.user.id), ctx.state.user.name]
      );
      await enqueueEvent(connection, {
        type: EVENTS.PROJECT_ACCEPTED,
        aggregateId: id,
        customerId: Number(project.customer_id),
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales', 'finance'],
        payload: {
          project_id: id,
          order_id: Number(project.order_id),
          order_no: project.order_no,
          customer_id: Number(project.customer_id),
          accepted_at: acceptedAtSql,
        },
      });
    });
    ctx.body = { project: toProject(await loadProject(ctx, id)) };
  },
};
