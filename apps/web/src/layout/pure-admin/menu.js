// 侧边栏菜单（title 使用 i18n key，渲染时翻译）
// roles 字段控制哪些角色能看到；不写 roles 表示公开可见
export const routerArrays = [
  { path: '/home', meta: { key: 'home' } },
  { path: '/workbench', meta: { key: 'overview', requiresRoles: ['super_admin', 'sales_manager', 'engineering_manager', 'finance_manager', 'hr_manager', 'salesperson', 'electrical_engineer', 'structural_engineer', 'warehouse', 'accountant', 'after_sales', 'after_sales_manager'] } },
  { path: '/workbench/customers', meta: { key: 'customers', requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
  { path: '/workbench/surveys', meta: { key: 'surveys', requiresRoles: ['super_admin', 'sales_manager', 'engineering_manager', 'salesperson', 'electrical_engineer', 'structural_engineer', 'after_sales_manager'] } },
  { path: '/workbench/quotes', meta: { key: 'quotes', requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
  { path: '/workbench/orders', meta: { key: 'orders', requiresRoles: ['super_admin', 'sales_manager', 'engineering_manager', 'salesperson', 'electrical_engineer', 'structural_engineer', 'after_sales_manager', 'accountant'] } },
  { path: '/workbench/tickets', meta: { key: 'tickets', requiresRoles: ['super_admin', 'sales_manager', 'salesperson', 'electrical_engineer', 'structural_engineer', 'after_sales', 'after_sales_manager'] } },
  { path: '/workbench/catalog', meta: { key: 'catalog', requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
  { path: '/workbench/ledger', meta: { key: 'ledger', requiresRoles: ['super_admin', 'finance_manager', 'accountant'] } },
  { path: '/workbench/settlements', meta: { key: 'settlements', requiresRoles: ['super_admin', 'finance_manager', 'accountant'] } },
  { path: '/workbench/manager-ledger', meta: { key: 'managerLedger', requiresRoles: ['super_admin', 'sales_manager'] } },
  { path: '/workbench/hrms/performance', meta: { key: 'hrmsPerformance', requiresRoles: ['super_admin'] } },
  { path: '/workbench/hrms/rules', meta: { key: 'hrmsRules', requiresRoles: ['super_admin'] } },
  { path: '/workbench/hrms/manager-rules', meta: { key: 'managerRules', requiresRoles: ['super_admin'] } },
  { path: '/workbench/hrms/reports', meta: { key: 'hrmsReports', requiresRoles: ['super_admin'] } },
  { path: '/workbench/admin', meta: { key: 'admin', requiresRoles: ['super_admin', 'sales_manager'] } },
  { path: '/workbench/health', meta: { key: 'serviceHealth', requiresRoles: ['super_admin'] } },
];
