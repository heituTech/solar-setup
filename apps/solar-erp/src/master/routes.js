'use strict';

const { auth, roles } = require('../common/auth');
const { actorOf } = require('../common/http');
const service = require('./service');

async function listOptions(ctx) {
  ctx.body = await service.options(ctx.app.db);
}

async function list(ctx) {
  ctx.body = await service.list(ctx.app.db, ctx.params.resource, ctx.query);
}

async function detail(ctx) {
  ctx.body = await service.detail(ctx.app.db, ctx.params.resource, ctx.params.id);
}

async function create(ctx) {
  ctx.body = await service.create(ctx.app.db, ctx.params.resource, ctx.request.body || {}, actorOf(ctx));
  ctx.status = 201;
}

async function update(ctx) {
  ctx.body = await service.update(ctx.app.db, ctx.params.resource, ctx.params.id, ctx.request.body || {}, actorOf(ctx));
}

async function remove(ctx) {
  ctx.body = await service.remove(ctx.app.db, ctx.params.resource, ctx.params.id, actorOf(ctx));
}

function mount(router) {
  router.get('/erp/api/master/options', auth, listOptions);
  router.get('/erp/api/master/:resource', auth, list);
  router.get('/erp/api/master/:resource/:id', auth, detail);
  // 主数据维护仅管理员
  router.post('/erp/api/master/:resource', auth, roles('admin'), create);
  router.patch('/erp/api/master/:resource/:id', auth, roles('admin'), update);
  router.delete('/erp/api/master/:resource/:id', auth, roles('admin'), remove);
}

module.exports = { mount };
