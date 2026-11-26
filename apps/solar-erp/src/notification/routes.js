'use strict';

const { auth } = require('../common/auth');
const notificationService = require('./service');

async function list(ctx) {
  ctx.body = await notificationService.list(ctx.app, ctx.state.user, ctx.query);
}

async function unreadCount(ctx) {
  ctx.body = { unread: await notificationService.unreadCount(ctx.app, ctx.state.user) };
}

async function markRead(ctx) {
  ctx.body = await notificationService.markRead(ctx.app, ctx.state.user, ctx.params.id);
}

async function markAllRead(ctx) {
  ctx.body = await notificationService.markAllRead(ctx.app, ctx.state.user);
}

function mount(router) {
  router.get('/erp/api/notifications', auth, list);
  router.get('/erp/api/notifications/unread-count', auth, unreadCount);
  router.post('/erp/api/notifications/read-all', auth, markAllRead);
  router.post('/erp/api/notifications/:id/read', auth, markRead);
}

module.exports = { mount };
