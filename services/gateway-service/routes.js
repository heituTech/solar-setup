'use strict';

// API 网关路由表：前缀 → 微服务。新增接口只改这一处。
// 匹配规则为「最长前缀优先」，因此 /pv/api/workbench/directory 会先于 /pv/api/workbench 命中。

const UPSTREAMS = {
  identity: process.env.IDENTITY_URL || 'http://127.0.0.1:7101',
  sales: process.env.SALES_URL || 'http://127.0.0.1:7102',
  delivery: process.env.DELIVERY_URL || 'http://127.0.0.1:7103',
  finance: process.env.FINANCE_URL || 'http://127.0.0.1:7104',
  hrms: process.env.HRMS_URL || 'http://127.0.0.1:7105',
};

const TABLE = [
  ['/pv/api/notifications', 'identity'],
  ['/pv/api/auth', 'identity'],
  ['/pv/api/admin', 'identity'],
  ['/pv/api/approvals', 'identity'],
  ['/pv/api/workbench/directory', 'identity'],
  ['/pv/api/health', 'identity'],

  ['/pv/api/workbench/projects', 'delivery'],
  ['/pv/api/workbench/devices', 'delivery'],
  ['/pv/api/workbench/tickets', 'delivery'],

  ['/pv/api/workbench/finance', 'finance'],
  ['/pv/api/workbench/payments', 'finance'],
  ['/pv/api/workbench/adjustments', 'finance'],
  ['/pv/api/workbench/compensation-config', 'finance'],
  ['/pv/api/workbench/commission-rules', 'finance'],
  ['/pv/api/workbench/settlements', 'finance'],
  ['/pv/api/workbench/ledger', 'finance'],

  ['/pv/api/hrms', 'hrms'],

  ['/pv/api/workbench', 'sales'],
  ['/pv/api/products', 'sales'],
  ['/pv/api/config', 'sales'],
  ['/pv/api/geo', 'sales'],
  ['/pv/api/cases', 'sales'],
];

const ROUTES = TABLE
  .map(([prefix, service]) => ({ prefix, service, target: UPSTREAMS[service] }))
  .sort((a, b) => b.prefix.length - a.prefix.length);

function resolveRoute(url) {
  const path = String(url || '').split('?')[0];
  for (const route of ROUTES) {
    if (path === route.prefix || path.startsWith(`${route.prefix}/`)) return route;
  }
  return null;
}

module.exports = { resolveRoute, ROUTES, UPSTREAMS };
