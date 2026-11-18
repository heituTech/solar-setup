// 侧边栏菜单（title 使用 i18n key，渲染时翻译）
export const routerArrays = [
  { path: '/home', meta: { key: 'home' } },
  { path: '/cases', meta: { key: 'memberCases', requiresAuth: true } },
  { path: '/workbench', meta: { key: 'overview', staff: true } },
  { path: '/workbench/customers', meta: { key: 'customers', staff: true } },
  { path: '/workbench/surveys', meta: { key: 'surveys', staff: true } },
  { path: '/workbench/quotes', meta: { key: 'quotes', staff: true } },
  { path: '/workbench/orders', meta: { key: 'orders', staff: true } },
  { path: '/workbench/projects', meta: { key: 'projects', staff: true } },
  { path: '/workbench/tickets', meta: { key: 'tickets', staff: true } },
  { path: '/workbench/ledger', meta: { key: 'ledger', staff: true } },
  { path: '/workbench/settlements', meta: { key: 'settlements', staff: true } },
  { path: '/workbench/catalog', meta: { key: 'catalog', staff: true } },
  { path: '/workbench/admin', meta: { key: 'admin', staff: true } },
  { path: '/workbench/health', meta: { key: 'serviceHealth', staff: true } },
];
