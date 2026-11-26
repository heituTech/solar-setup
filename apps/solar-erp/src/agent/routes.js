'use strict';

const { auth } = require('../common/auth');
const agentService = require('./service');

async function chat(ctx) {
  const { message } = ctx.request.body || {};
  ctx.body = await agentService.chat(ctx.app, message, ctx.state.user);
}

function mount(router) {
  router.post('/erp/api/agent/chat', auth, chat);
}

module.exports = { mount };
