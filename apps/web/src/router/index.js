import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const staff = (component, meta = {}) => ({
  component,
  meta: { layout: 'staff', requiresAuth: true, staff: true, ...meta },
});

const routes = [
  { path: '/', component: () => import('../views/public/HomeView.vue'), meta: { layout: 'public' } },
  { path: '/login', component: () => import('../views/public/LoginView.vue'), meta: { layout: 'public' } },
  { path: '/register', component: () => import('../views/public/RegisterView.vue'), meta: { layout: 'public' } },
  {
    path: '/cases',
    component: () => import('../views/public/CasesView.vue'),
    meta: { layout: 'public', requiresAuth: true },
  },
  { path: '/workbench', ...staff(() => import('../views/staff/OverviewView.vue')) },
  { path: '/workbench/customers', ...staff(() => import('../views/staff/CustomersView.vue')) },
  { path: '/workbench/surveys', ...staff(() => import('../views/staff/SurveysView.vue')) },
  { path: '/workbench/quotes', ...staff(() => import('../views/staff/QuotesView.vue')) },
  { path: '/workbench/orders', ...staff(() => import('../views/staff/OrdersView.vue')) },
  { path: '/workbench/projects', ...staff(() => import('../views/staff/ProjectsView.vue')) },
  { path: '/workbench/tickets', ...staff(() => import('../views/staff/TicketsView.vue')) },
  { path: '/workbench/ledger', ...staff(() => import('../views/staff/LedgerView.vue')) },
  { path: '/workbench/settlements', ...staff(() => import('../views/staff/SettlementsView.vue')) },
  { path: '/workbench/catalog', ...staff(() => import('../views/staff/CatalogView.vue')) },
  { path: '/workbench/admin', ...staff(() => import('../views/staff/AdminView.vue')) },
  { path: '/workbench/health', ...staff(() => import('../views/staff/HealthView.vue')) },
  { path: '/:pathMatch(.*)*', redirect: '/' },
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
  if (to.meta.staff && !auth.staff) return { path: '/cases' };
  if ((to.path === '/login' || to.path === '/register') && auth.authenticated) {
    return { path: auth.staff ? '/workbench' : '/cases' };
  }
  return true;
});

export default router;
