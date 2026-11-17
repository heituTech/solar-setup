<template>
  <div class="public-shell">
    <header class="public-header">
      <router-link to="/" class="brand">
        <span>HEITU ERP v2.0</span>
      </router-link>
      <nav class="public-nav">
        <router-link to="/">{{ t('home') }}</router-link>
        <router-link v-if="auth.staff" to="/workbench">{{ t('workspace') }}</router-link>
        <router-link v-if="auth.authenticated && !auth.staff" to="/cases">{{ t('memberCases') }}</router-link>
        <template v-if="auth.authenticated">
          <span class="muted">{{ auth.user?.name }}</span>
          <el-button size="small" @click="logout">{{ t('logout') }}</el-button>
        </template>
        <template v-else>
          <router-link to="/login">{{ t('login') }}</router-link>
          <el-button size="small" type="primary" @click="$router.push('/register')">{{ t('register') }}</el-button>
        </template>
      </nav>
    </header>
    <main class="public-main">
      <slot />
    </main>
    <footer class="public-footer">HEITU ERP v2.0 · {{ t('salesChain') }}</footer>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();

function logout() {
  auth.logout();
  router.push('/');
}
</script>
