'use strict';

const { auth, roles } = require('../common/auth');
const salesService = require('./service');
const notificationService = require('../notification/service');

const storeTeam = roles('store_manager', 'store_clerk');
const managers = roles('store_manager');

async function list(ctx) {
  ctx.body = await salesService.listOrders(ctx.app.db, ctx.query, ctx.state.user);
}

async function detail(ctx) {
  ctx.body = await salesService.getOrder(ctx.app.db, ctx.params.id, ctx.state.user);
}

async function create(ctx) {
  const result = await salesService.createOrder(ctx.app.db, ctx.request.body || {}, ctx.state.user);
  const order = await salesService.getOrder(ctx.app.db, result.id, ctx.state.user);
  await notificationService.dispatch(ctx.app, {
    roles: ['store_manager', 'electrical_engineer', 'structural_engineer'], storeId: order.store_id,
    title: `新销售单：${result.order_no}`,
    content: `${order.created_by_name || ctx.state.user.name} 开单 ${result.total_amount}，已生成项目工单 ${result.project_no}，请安排勘测。`,
    type: 'sales', bizType: 'sales_order', bizId: result.id, pushExternal: true,
  });
  ctx.body = { ...result, store_id: order.store_id };
  ctx.status = 201;
}

async function confirm(ctx) {
  const result = await salesService.confirmOrder(ctx.app.db, ctx.params.id, ctx.state.user);
  const order = await salesService.getOrder(ctx.app.db, ctx.params.id, ctx.state.user);
  await notificationService.dispatch(ctx.app, {
    userIds: [order.created_by],
    title: `销售单已确认：${order.order_no}`,
    content: `你的销售单已由 ${ctx.state.user.name} 确认，可继续推进勘测与施工。`,
    type: 'sales', bizType: 'sales_order', bizId: order.id,
  });
  ctx.body = result;
}

async function cancel(ctx) {
  const result = await salesService.cancelOrder(ctx.app.db, ctx.params.id, ctx.state.user);
  const order = await salesService.getOrder(ctx.app.db, ctx.params.id, ctx.state.user);
  await notificationService.dispatch(ctx.app, {
    userIds: [order.created_by],
    title: `销售单已作废：${order.order_no}`,
    content: `销售单已由 ${ctx.state.user.name} 作废。`,
    type: 'sales', bizType: 'sales_order', bizId: order.id,
  });
  ctx.body = result;
}

async function summary(ctx) {
  ctx.body = await salesService.todaySummary(ctx.app.db, ctx.state.user);
}

function mount(router) {
  router.get('/erp/api/sales/orders', auth, storeTeam, list);
  router.get('/erp/api/sales/orders/:id', auth, storeTeam, detail);
  router.post('/erp/api/sales/orders', auth, storeTeam, create);
  router.post('/erp/api/sales/orders/:id/confirm', auth, managers, confirm);
  router.post('/erp/api/sales/orders/:id/cancel', auth, managers, cancel);
  router.get('/erp/api/sales/summary', auth, storeTeam, summary);
}

module.exports = { mount };
