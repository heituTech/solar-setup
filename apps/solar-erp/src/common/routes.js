'use strict';

const { pageParams, paged } = require('./http');
const { auth } = require('./auth');
const files = require('./files');

async function health(ctx) {
  await ctx.app.db.query('SELECT 1');
  ctx.body = { status: 'ok', service: 'erp', time: new Date().toISOString() };
}

async function auditLogs(ctx) {
  const { page, pageSize, offset } = pageParams(ctx.query);
  const where = [];
  const params = [];
  for (const field of ['module', 'entity', 'action']) {
    if (ctx.query[field]) { where.push(`${field} = ?`); params.push(ctx.query[field]); }
  }
  if (ctx.query.entity_id) {
    where.push('entity_id = ?');
    params.push(String(ctx.query.entity_id));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await ctx.app.db.query(`SELECT COUNT(*) AS total FROM audit_logs ${clause}`, params);
  const [items] = await ctx.app.db.query(
    `SELECT id, module, entity, entity_id, action, actor_id, actor_name, before_json, after_json, remark, created_at
     FROM audit_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  ctx.body = paged(items, total, page, pageSize);
}

function mount(router) {
  router.get('/erp/api/health', health);
  router.get('/erp/api/audit-logs', auth, auditLogs);
  files.mount(router, auth);
}

module.exports = { mount };
