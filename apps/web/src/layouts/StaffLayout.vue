<template>
  <div class="staff-shell">
    <aside class="staff-aside">
      <div class="staff-brand">
        <span>HEITU ERP v2.0</span>
      </div>
      <el-menu :default-active="activePath" class="staff-menu" router>
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          {{ t(item.label) }}
        </el-menu-item>
      </el-menu>
      <div class="staff-aside-footer">v2.0 · {{ t('workspace') }}</div>
    </aside>
    <div class="staff-main">
      <header class="staff-header">
        <h2>{{ pageTitle }}</h2>
        <div class="staff-user">
          <el-select v-model="locale" size="small" style="width: 110px" @change="changeLocale">
            <el-option v-for="[code, label] in languages" :key="code" :value="code" :label="label" />
          </el-select>
          <span>{{ auth.user?.name }} · {{ roleLabel }}</span>
          <el-button size="small" @click="logout">{{ t('logout') }}</el-button>
        </div>
      </header>
      <div class="staff-content">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { languages } from '../locales';

const { t, locale } = useI18n();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const allMenus = [
  { path: '/workbench', label: 'overview' },
  { path: '/workbench/customers', label: 'customers' },
  { path: '/workbench/surveys', label: 'surveys' },
  { path: '/workbench/quotes', label: 'quotes' },
  { path: '/workbench/orders', label: 'orders' },
  { path: '/workbench/projects', label: 'projects' },
  { path: '/workbench/tickets', label: 'tickets' },
  { path: '/workbench/ledger', label: 'ledger' },
  { path: '/workbench/settlements', label: 'settlements' },
  { path: '/workbench/catalog', label: 'catalog' },
  { path: '/workbench/admin', label: 'admin', roles: ['super_admin', 'sales_manager'] },
  { path: '/workbench/health', label: 'serviceHealth', roles: ['super_admin', 'accountant'] },
];

const menus = computed(() => allMenus.filter((item) => !item.roles || item.roles.includes(auth.role)));
const roleLabel = computed(() => {
  const key = `role_${auth.role || 'member'}`;
  const label = t(key);
  return label === key ? auth.role || 'member' : label;
});
const activePath = computed(() => route.path);
const pageTitle = computed(() => {
  const match = allMenus.find((item) => item.path === route.path);
  return match ? t(match.label) : t('workspace');
});

function changeLocale(value) {
  locale.value = value;
  localStorage.setItem('lang', value);
}

function logout() {
  auth.logout();
  router.push('/');
}
</script>
