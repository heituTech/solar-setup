// 侧边栏菜单
export const routerArrays = [
  { path: '/home', meta: { title: '首页' } },
  { path: '/cases', meta: { title: '案例', requiresAuth: true } },
  { path: '/workbench', meta: { title: '概览', staff: true } },
  { path: '/workbench/customers', meta: { title: '客户', staff: true } },
  { path: '/workbench/surveys', meta: { title: '勘测', staff: true } },
  { path: '/workbench/quotes', meta: { title: '报价', staff: true } },
  { path: '/workbench/orders', meta: { title: '订单', staff: true } },
  { path: '/workbench/projects', meta: { title: '交付', staff: true } },
  { path: '/workbench/tickets', meta: { title: '工单', staff: true } },
  { path: '/workbench/ledger', meta: { title: '台账', staff: true } },
  { path: '/workbench/settlements', meta: { title: '结算', staff: true } },
  { path: '/workbench/catalog', meta: { title: '产品', staff: true } },
  { path: '/workbench/admin', meta: { title: '管理', staff: true } },
  { path: '/workbench/health', meta: { title: '服务', staff: true } },
];
