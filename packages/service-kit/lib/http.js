'use strict';

const crypto = require('crypto');

async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (error) {
    const status = Number(error.status || 500);
    ctx.status = status;
    ctx.body = {
      error: error.code && status < 500 ? error.code : (status < 500 ? error.message : 'internal_error'),
      request_id: ctx.state.requestId,
    };
    if (error.details) ctx.body.details = error.details;
    if (status >= 500) ctx.app.emit('error', error, ctx);
  }
}

async function requestId(ctx, next) {
  const incoming = ctx.get('x-request-id');
  ctx.state.requestId = /^[a-zA-Z0-9_.:-]{8,80}$/.test(incoming) ? incoming : crypto.randomUUID();
  ctx.set('X-Request-ID', ctx.state.requestId);
  await next();
}

async function cors(ctx, next) {
  ctx.set('Access-Control-Allow-Origin', ctx.get('origin') || '*');
  ctx.set('Access-Control-Allow-Headers', 'authorization,content-type,x-request-id,x-service-name,x-service-timestamp,x-service-signature');
  ctx.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  ctx.set('Access-Control-Max-Age', '600');
  if (ctx.method === 'OPTIONS') {
    ctx.status = 204;
    return;
  }
  await next();
}

function signature(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

async function internalFetch(url, options = {}) {
  const body = options.body === undefined ? '' : JSON.stringify(options.body);
  const service = options.service || process.env.SERVICE_NAME || 'unknown';
  const secret = options.secret || process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) throw new Error('INTERNAL_SERVICE_SECRET is required');
  const attempts = Number(options.retries ?? 1) + 1;
  for (let attempt = 1; ; attempt += 1) {
    const timestamp = String(Date.now());
    try {
      const response = await fetch(url, {
        method: options.method || (body ? 'POST' : 'GET'),
        headers: {
          'content-type': 'application/json',
          'x-service-name': service,
          'x-service-timestamp': timestamp,
          'x-service-signature': signature(secret, timestamp, body),
          'x-request-id': options.requestId || crypto.randomUUID(),
          ...(options.headers || {}),
        },
        body: body || undefined,
        signal: AbortSignal.timeout(options.timeoutMs || 5000),
      });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
      if (!response.ok) {
        const error = new Error(data.error || `internal_request_${response.status}`);
        error.status = response.status;
        error.details = data;
        throw error;
      }
      return data;
    } catch (error) {
      // HTTP 层面的错误不重试；仅对连接复用失败、超时等网络错误重试一次。
      if (error.status || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}

function verifyInternal(options = {}) {
  return async function internalGuard(ctx, next) {
    const secret = options.secret || process.env.INTERNAL_SERVICE_SECRET;
    const timestamp = ctx.get('x-service-timestamp');
    const body = ctx.request.body === undefined ? '' : JSON.stringify(ctx.request.body);
    const provided = ctx.get('x-service-signature');
    const service = ctx.get('x-service-name');
    const allowed = options.services;
    if (!secret || !timestamp || !provided || Math.abs(Date.now() - Number(timestamp)) > 300000 ||
        (allowed && !allowed.includes(service))) ctx.throw(401, 'invalid_service_credentials');
    const expected = Buffer.from(signature(secret, timestamp, body));
    const actual = Buffer.from(provided);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      ctx.throw(401, 'invalid_service_credentials');
    }
    ctx.state.callerService = service;
    await next();
  };
}

module.exports = { errorHandler, requestId, cors, internalFetch, verifyInternal };
