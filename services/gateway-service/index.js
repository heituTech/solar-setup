'use strict';

// 轻量 API 网关：nginx 只把 /pv/api/ 转发到这里，由本进程按路由表分发到各微服务。
// 只做三件事：前缀路由、透传请求/响应、记录访问日志与上游故障（502/504）。
// 鉴权仍由各服务通过 @solar/service-kit 完成（JWT 验签 + identity 用户状态校验）。

const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { resolveRoute } = require('./routes');

const PORT = Number(process.env.PORT || 7100);
const BIND = process.env.BIND_HOST || '127.0.0.1';
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 60000);

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function buildHeaders(req, requestId) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(key)) headers[key] = value;
  }
  headers['x-request-id'] = requestId;
  headers['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'http';
  headers['x-forwarded-host'] = req.headers['x-forwarded-host'] || req.headers.host || '';
  return headers;
}

function sendJson(res, status, payload) {
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function log(entry) {
  console.log(JSON.stringify({ level: entry.status >= 500 ? 'error' : 'info', ...entry }));
}

const server = http.createServer((req, res) => {
  const startedAt = Date.now();
  const requestId = req.headers['x-request-id'] || randomUUID();
  const route = resolveRoute(req.url);

  if (!route) {
    sendJson(res, 404, { error: 'route_not_found' });
    log({ requestId, method: req.method, url: req.url, service: null, status: 404, ms: Date.now() - startedAt });
    return;
  }

  const upstreamUrl = new URL(route.target);
  const proxyReq = http.request({
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port || 80,
    method: req.method,
    path: req.url,
    headers: buildHeaders(req, requestId),
    timeout: TIMEOUT_MS,
  }, (proxyRes) => {
    const headers = { ...proxyRes.headers, 'x-request-id': requestId };
    res.writeHead(proxyRes.statusCode || 502, headers);
    proxyRes.pipe(res);
    proxyRes.on('end', () => {
      log({ requestId, method: req.method, url: req.url, service: route.service, status: proxyRes.statusCode, ms: Date.now() - startedAt });
    });
  });

  proxyReq.on('timeout', () => proxyReq.destroy(new Error('upstream_timeout')));
  proxyReq.on('error', (error) => {
    const timeout = error.message === 'upstream_timeout';
    sendJson(res, timeout ? 504 : 502, { error: timeout ? 'gateway_timeout' : 'bad_gateway', request_id: requestId });
    log({ requestId, method: req.method, url: req.url, service: route.service, status: timeout ? 504 : 502, ms: Date.now() - startedAt, upstream_error: error.message });
  });

  req.pipe(proxyReq);
});

server.listen(PORT, BIND, () => {
  console.log(`gateway listening on http://${BIND}:${PORT}`);
});
