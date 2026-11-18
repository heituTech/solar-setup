'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { internalFetch } = require('./http');

function keyFromEnv(name) {
  const value = process.env[name];
  if (!value) return null;
  return value.replace(/\\n/g, '\n');
}

function signAccessToken(user) {
  const privateKey = keyFromEnv('JWT_PRIVATE_KEY');
  if (!privateKey) throw new Error('JWT_PRIVATE_KEY is required');
  return jwt.sign(
    { role: user.role },
    privateKey,
    {
      algorithm: 'RS256', subject: String(user.id), expiresIn: process.env.JWT_EXPIRES_IN || '12h',
      issuer: 'solar-identity', audience: 'solar-services', jwtid: crypto.randomUUID(),
    }
  );
}

function verifyAccessToken(token, publicKey = keyFromEnv('JWT_PUBLIC_KEY')) {
  if (!publicKey) throw new Error('JWT_PUBLIC_KEY is required');
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'], issuer: 'solar-identity', audience: 'solar-services',
  });
}

function createAuthMiddleware(options = {}) {
  const cache = new Map();
  const ttl = Number(options.cacheTtlMs || 30000);
  return async function authenticate(ctx, next) {
    const header = ctx.get('authorization');
    if (!header.startsWith('Bearer ')) ctx.throw(401, 'unauthorized');
    const token = header.slice(7).trim();
    let payload;
    try {
      payload = verifyAccessToken(token, options.publicKey);
    } catch (error) {
      ctx.throw(401, 'unauthorized');
    }
    const cacheKey = crypto.createHash('sha256').update(token).digest('hex');
    const cached = cache.get(cacheKey);
    let user = cached && cached.expiresAt > Date.now() ? cached.user : null;
    if (!user) {
      try {
        if (options.loadUser) {
          user = await options.loadUser(payload, token, ctx);
        } else {
          const data = await internalFetch(`${options.identityUrl}/internal/auth/introspect`, {
            service: options.serviceName || process.env.SERVICE_NAME,
            secret: options.internalSecret,
            body: {},
            headers: { authorization: `Bearer ${token}` },
          });
          user = data.user;
        }
      } catch (error) {
        if (error.status === 401 || error.status === 403) throw error;
        ctx.throw(503, 'authentication_unavailable');
      }
      if (!user || user.status !== 'active' || user.role !== payload.role) ctx.throw(401, 'unauthorized');
      cache.set(cacheKey, { user, expiresAt: Date.now() + ttl });
    }
    ctx.state.user = user;
    if (cache.size > 1000) {
      for (const [key, value] of cache) if (value.expiresAt <= Date.now()) cache.delete(key);
    }
    await next();
  };
}

function requireRoles(...roles) {
  const allowed = roles.flat();
  return async function roleGuard(ctx, next) {
    if (!ctx.state.user) ctx.throw(401, 'unauthorized');
    if (!allowed.includes(ctx.state.user.role)) ctx.throw(403, 'forbidden');
    await next();
  };
}

function salesScope(user) {
  if (user.role === 'super_admin' || user.role === 'accountant') return null;
  if (user.role === 'salesperson') return [Number(user.id)];
  if (user.role === 'sales_manager') {
    return [...new Set([Number(user.id), ...(user.salesperson_ids || []).map(Number)])];
  }
  return [];
}

module.exports = { signAccessToken, verifyAccessToken, createAuthMiddleware, requireRoles, salesScope, keyFromEnv };
