import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  { path: '/login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('@/layout/ErpLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '概览' } },
      { path: 'sales', component: () => import('@/views/sales/SalesOrdersView.vue'), meta: { title: '门店销售', roles: ['admin', 'store_manager', 'store_clerk'] } },
      { path: 'projects', component: () => import('@/views/project/ProjectsView.vue'), meta: { title: '项目工单' } },
      { path: 'projects/:id', component: () => import('@/views/project/ProjectDetailView.vue'), meta: { title: '项目详情' } },
      { path: 'inventory', component: () => import('@/views/inventory/InventoryView.vue'), meta: { title: '库存领料' } },
      { path: 'finance', component: () => import('@/views/finance/FinanceView.vue'), meta: { title: '财务应收', roles: ['admin', 'store_manager'] } },
      { path: 'master', component: () => import('@/views/master/MasterDataView.vue'), meta: { title: '主数据', roles: ['admin'] } },
      { path: 'users', component: () => import('@/views/auth/UsersView.vue'), meta: { title: '账号管理', roles: ['admin'] } },
      { path: 'agent', component: () => import('@/views/agent/AgentView.vue'), meta: { title: 'AI 助手' } },
      { path: 'notifications', component: () => import('@/views/notification/NotificationsView.vue'), meta: { title: '消息中心' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({
  history: createWebHistory('/erp/'),
  routes,
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const auth = useAuthStore();
  if (!auth.token) return { path: '/login', query: { redirect: to.fullPath } };
  if (!auth.user) {
    const okUser = await auth.refresh();
    if (!okUser) return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.meta.roles && !to.meta.roles.includes(auth.role)) return { path: '/dashboard' };
  return true;
});

export default router;
