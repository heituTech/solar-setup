<template>
  <div class="staff-shell">
    <div class="staff-drawer-mask" :class="{ open: mobileNavOpen }" @click="mobileNavOpen = false"></div>
    <aside class="staff-aside" :class="{ open: mobileNavOpen }">
      <div class="staff-brand">
        <span>HEITU ERP v2.0</span>
      </div>
      <el-menu :default-active="activePath" class="staff-menu" router @select="mobileNavOpen = false">
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          {{ t(item.label) }}
        </el-menu-item>
      </el-menu>
      <div class="staff-aside-footer">v2.0 · {{ t('workspace') }}</div>
    </aside>
    <div class="staff-main">
      <header class="staff-header">
        <div class="staff-header-left">
          <button class="nav-toggle mobile-only" @click="mobileNavOpen = !mobileNavOpen" aria-label="menu">
            <span></span><span></span><span></span>
          </button>
          <h2>{{ pageTitle }}</h2>
        </div>
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
const mobileNavOpen = ref(false);

const allMenus = [
  { path: '/workbench', label: 'overview' },
  { path: '/workbench/customers', label: 'customers' },
  { path: '/workbench/surveys', label: 'surveys' },
  { path: '/workbench/quotes', label: 'quotes' },
  { path: '/workbench/orders', label: 'orders' },
  { path: '/workbench/projects', label: 'projects' },
  { path: '/workbench/tickets', label: 'tickets' },
  { path: '/workbench/ledger', label: 'ledger', roles: ['super_admin'] },
  { path: '/workbench/settlements', label: 'settlements', roles: ['super_admin'] },
  { path: '/workbench/catalog', label: 'catalog' },
  { path: '/workbench/admin', label: 'admin', roles: ['super_admin', 'sales_manager'] },
  { path: '/workbench/health', label: 'serviceHealth', roles: ['super_admin'] },
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

<style scoped>
.staff-header-left { display: flex; align-items: center; gap: 10px; }
.nav-toggle {
  display: inline-flex; flex-direction: column; justify-content: center; gap: 4px;
  width: 32px; height: 32px; padding: 0; background: transparent; border: none; cursor: pointer;
}
.nav-toggle span {
  display: block; width: 20px; height: 2px; background: var(--solar-ink); border-radius: 2px; margin: 0 auto;
}
</style>
