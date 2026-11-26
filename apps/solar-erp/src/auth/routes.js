'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { auth, roles, signToken } = require('../common/auth');
const { badRequest, unauthorized, notFound, actorOf } = require('../common/http');
const service = require('./service');

// 可选验证码：进程内保存，5 分钟有效；关闭时登录不校验。
const captchas = new Map();

function issueCaptcha(ctx) {
  const a = crypto.randomInt(1, 10);
  const b = crypto.randomInt(1, 10);
  const id = crypto.randomUUID();
  captchas.set(id, { answer: a + b, expiresAt: Date.now() + 5 * 60 * 1000 });
  for (const [key, value] of captchas) if (value.expiresAt <= Date.now()) captchas.delete(key);
  ctx.body = { captcha_id: id, question: `${a} + ${b} = ?`, enabled: ctx.app.config.erp.captchaEnabled };
}

function checkCaptcha(ctx, id, code) {
  if (!ctx.app.config.erp.captchaEnabled) return;
  const item = captchas.get(id);
  if (!item || item.expiresAt <= Date.now()) badRequest('captcha_expired');
  if (Number(code) !== item.answer) badRequest('captcha_invalid');
  captchas.delete(id);
}

async function login(ctx) {
  const body = ctx.request.body || {};
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) badRequest('credentials_required');
  checkCaptcha(ctx, body.captcha_id, body.captcha_code);

  const user = await service.findByUsername(ctx.app.db, username);
  if (!user || user.status !== 'active' || !bcrypt.compareSync(password, user.password_hash)) {
    unauthorized('invalid_credentials');
  }
  await ctx.app.db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  ctx.body = { token: signToken(user), user: service.publicUser(user) };
}

async function me(ctx) {
  ctx.body = { user: ctx.state.user };
}

async function logout(ctx) {
  // 无状态 JWT：客户端丢弃即可；预留接口便于将来接入黑名单。
  ctx.body = { ok: true };
}

async function listUsers(ctx) {
  ctx.body = await service.list(ctx.app.db, ctx.query);
}

async function createUser(ctx) {
  ctx.body = await service.create(ctx.app.db, ctx.request.body || {}, actorOf(ctx));
  ctx.status = 201;
}

async function updateUser(ctx) {
  ctx.body = await service.update(ctx.app.db, ctx.params.id, ctx.request.body || {}, actorOf(ctx));
}

async function disableUser(ctx) {
  if (Number(ctx.params.id) === Number(ctx.state.user.id)) badRequest('cannot_disable_self');
  ctx.body = await service.disable(ctx.app.db, ctx.params.id, actorOf(ctx));
}

function mount(router) {
  router.get('/erp/api/auth/captcha', issueCaptcha);
  router.post('/erp/api/auth/login', login);
  router.get('/erp/api/auth/me', auth, me);
  router.post('/erp/api/auth/logout', auth, logout);

  router.get('/erp/api/auth/users', auth, roles('admin'), listUsers);
  router.post('/erp/api/auth/users', auth, roles('admin'), createUser);
  router.patch('/erp/api/auth/users/:id', auth, roles('admin'), updateUser);
  router.delete('/erp/api/auth/users/:id', auth, roles('admin'), disableUser);

  router.get('/erp/api/auth/roles', auth, (ctx) => {
    ctx.body = { items: service.ROLES };
  });
}

module.exports = { mount };
