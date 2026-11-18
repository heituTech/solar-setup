import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  {
    path: '/',
    component: () => import('@/layout/pure-admin/index.vue'),
    redirect: '/home',
    children: [
      { path: 'home', component: () => import('@/views/public/HomeView.vue'), meta: { title: '首页' } },
      { path: 'cases', component: () => import('@/views/public/CasesView.vue'), meta: { title: '案例', requiresAuth: true } },
      { path: 'workbench', component: () => import('@/views/staff/OverviewView.vue'), meta: { title: '概览', requiresAuth: true, requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
      { path: 'workbench/customers', component: () => import('@/views/staff/CustomersView.vue'), meta: { title: '客户', requiresAuth: true, requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
      { path: 'workbench/surveys', component: () => import('@/views/staff/SurveysView.vue'), meta: { title: '勘测', requiresAuth: true, requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
      { path: 'workbench/quotes', component: () => import('@/views/staff/QuotesView.vue'), meta: { title: '报价', requiresAuth: true, requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
      { path: 'workbench/orders', component: () => import('@/views/staff/OrdersView.vue'), meta: { title: '订单', requiresAuth: true, requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
      { path: 'workbench/projects', component: () => import('@/views/staff/ProjectsView.vue'), meta: { title: '交付', requiresAuth: true, requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
      { path: 'workbench/tickets', component: () => import('@/views/staff/TicketsView.vue'), meta: { title: '工单', requiresAuth: true, requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
      { path: 'workbench/catalog', component: () => import('@/views/staff/CatalogView.vue'), meta: { title: '产品', requiresAuth: true, requiresRoles: ['super_admin', 'sales_manager', 'salesperson'] } },
      { path: 'workbench/ledger', component: () => import('@/views/staff/LedgerView.vue'), meta: { title: '台账', requiresAuth: true, requiresRoles: ['super_admin'] } },
      { path: 'workbench/settlements', component: () => import('@/views/staff/SettlementsView.vue'), meta: { title: '结算', requiresAuth: true, requiresRoles: ['super_admin'] } },
      { path: 'workbench/admin', component: () => import('@/views/staff/AdminView.vue'), meta: { title: '管理', requiresAuth: true, requiresRoles: ['super_admin', 'sales_manager'] } },
      { path: 'workbench/health', component: () => import('@/views/staff/HealthView.vue'), meta: { title: '服务', requiresAuth: true, requiresRoles: ['super_admin'] } },
    ],
  },
  { path: '/login', component: () => import('@/views/public/LoginView.vue'), meta: { title: '登录' } },
  { path: '/register', component: () => import('@/views/public/RegisterView.vue'), meta: { title: '注册' } },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.authenticated) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  // 细粒度角色拦截——防止用户手动输入 URL 绕过菜单隐藏
  const reqRoles = to.meta.requiresRoles;
  if (reqRoles && auth.authenticated && !reqRoles.includes(auth.role)) {
    // member 没有任何 workbench 权限，其他没权限的也回首页
    return { path: '/home' };
  }
  if ((to.path === '/login' || to.path === '/register') && auth.authenticated) {
    return { path: auth.role !== 'member' ? '/workbench' : '/home' };
  }
  return true;
});

export default router;
