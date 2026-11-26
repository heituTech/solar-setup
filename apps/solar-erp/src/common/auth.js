'use strict';

const jwt = require('jsonwebtoken');
const { unauthorized } = require('./http');

const USER_COLUMNS = 'id, username, name, role, store_id, phone, email, status, last_login_at, created_at';

function signToken(user) {
  return jwt.sign(
    { role: user.role, store_id: user.store_id || null, name: user.name },
    process.env.ERP_JWT_SECRET || 'erp-local-dev-secret-change-me',
    { subject: String(user.id), expiresIn: process.env.ERP_JWT_EXPIRES_IN || '12h' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.ERP_JWT_SECRET || 'erp-local-dev-secret-change-me', {
    algorithms: ['HS256'],
  });
}

async function loadUser(db, id) {
  const [rows] = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

/**
 * 登录态中间件：每次请求回源校验账号状态，避免禁用账号继续访问。
 */
async function auth(ctx, next) {
  const header = ctx.get('authorization') || '';
  if (!header.startsWith('Bearer ')) unauthorized('unauthorized');
  let payload;
  try {
    payload = verifyToken(header.slice(7).trim());
  } catch {
    unauthorized('unauthorized');
  }
  const user = await loadUser(ctx.app.db, payload.sub);
  if (!user || user.status !== 'active') unauthorized('unauthorized');
  ctx.state.user = user;
  await next();
}

/**
 * 角色守卫：admin 恒通过（管理员拥有全部业务权限）。
 */
function roles(...allowed) {
  const list = allowed.flat();
  return async (ctx, next) => {
    const user = ctx.state.user;
    if (!user) unauthorized('unauthorized');
    if (user.role !== 'admin' && !list.includes(user.role)) {
      const error = new Error('forbidden');
      error.status = 403;
      throw error;
    }
    await next();
  };
}

module.exports = { signToken, verifyToken, loadUser, auth, roles, USER_COLUMNS };
