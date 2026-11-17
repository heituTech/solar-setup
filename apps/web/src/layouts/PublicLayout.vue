<template>
  <div class="public-shell">
    <header class="public-header">
      <router-link to="/" class="brand">
        <span>HEITU ERP v2.0</span>
      </router-link>
      <button class="nav-toggle mobile-only" :aria-expanded="navOpen" @click="navOpen = !navOpen">
        <span></span><span></span><span></span>
      </button>
      <nav class="public-nav" :class="{ open: navOpen }">
        <router-link to="/" @click="navOpen = false">{{ t('home') }}</router-link>
        <router-link v-if="auth.staff" to="/workbench" @click="navOpen = false">{{ t('workspace') }}</router-link>
        <router-link v-if="auth.authenticated && !auth.staff" to="/cases" @click="navOpen = false">{{ t('memberCases') }}</router-link>
        <template v-if="auth.authenticated">
          <span class="muted">{{ auth.user?.name }}</span>
          <el-button size="small" @click="logout">{{ t('logout') }}</el-button>
        </template>
        <template v-else>
          <router-link to="/login" @click="navOpen = false">{{ t('login') }}</router-link>
          <el-button size="small" type="primary" @click="$router.push('/register')">{{ t('register') }}</el-button>
        </template>
      </nav>
    </header>
    <main class="public-main" @click="navOpen = false">
      <slot />
    </main>
    <footer class="public-footer">HEITU ERP v2.0 · {{ t('salesChain') }}</footer>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const navOpen = ref(false);

function logout() {
  auth.logout();
  navOpen.value = false;
  router.push('/');
}
</script>

<style scoped>
.nav-toggle {
  display: inline-flex; flex-direction: column; justify-content: center; gap: 4px;
  width: 36px; height: 36px; padding: 0; background: transparent; border: none; cursor: pointer;
}
.nav-toggle span {
  display: block; width: 22px; height: 2px; background: var(--solar-ink); border-radius: 2px; margin: 0 auto;
  transition: transform .2s, opacity .2s;
}
</style>
