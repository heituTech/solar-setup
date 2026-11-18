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
      { path: 'workbench', component: () => import('@/views/staff/OverviewView.vue'), meta: { title: '概览', requiresAuth: true, staff: true } },
      { path: 'workbench/customers', component: () => import('@/views/staff/CustomersView.vue'), meta: { title: '客户', requiresAuth: true, staff: true } },
      { path: 'workbench/surveys', component: () => import('@/views/staff/SurveysView.vue'), meta: { title: '勘测', requiresAuth: true, staff: true } },
      { path: 'workbench/quotes', component: () => import('@/views/staff/QuotesView.vue'), meta: { title: '报价', requiresAuth: true, staff: true } },
      { path: 'workbench/orders', component: () => import('@/views/staff/OrdersView.vue'), meta: { title: '订单', requiresAuth: true, staff: true } },
      { path: 'workbench/projects', component: () => import('@/views/staff/ProjectsView.vue'), meta: { title: '交付', requiresAuth: true, staff: true } },
      { path: 'workbench/tickets', component: () => import('@/views/staff/TicketsView.vue'), meta: { title: '工单', requiresAuth: true, staff: true } },
      { path: 'workbench/ledger', component: () => import('@/views/staff/LedgerView.vue'), meta: { title: '台账', requiresAuth: true, staff: true } },
      { path: 'workbench/settlements', component: () => import('@/views/staff/SettlementsView.vue'), meta: { title: '结算', requiresAuth: true, staff: true } },
      { path: 'workbench/catalog', component: () => import('@/views/staff/CatalogView.vue'), meta: { title: '产品', requiresAuth: true, staff: true } },
      { path: 'workbench/admin', component: () => import('@/views/staff/AdminView.vue'), meta: { title: '管理', requiresAuth: true, staff: true } },
      { path: 'workbench/health', component: () => import('@/views/staff/HealthView.vue'), meta: { title: '服务', requiresAuth: true, staff: true } },
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
  if (to.meta.staff && !auth.staff) return { path: '/home' };
  if ((to.path === '/login' || to.path === '/register') && auth.authenticated) {
    return { path: auth.staff ? '/workbench' : '/home' };
  }
  return true;
});

export default router;
