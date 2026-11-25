<script setup>
// Layout 由 router 的父级组件提供
import { onMounted, onBeforeUnmount, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import en from 'element-plus/es/locale/lang/en';
import { dbBusy } from './api/client';
import { useAuthStore } from './stores/auth';

const { locale } = useI18n();
const elLocale = computed(() => (locale.value === 'zh' ? zhCn : en));

// API 请求收到 401 时 client.js 会派发此事件，立即登出并清除所有用户信息
function handleUnauthorized() {
  const auth = useAuthStore();
  if (auth.token) auth.logout();
}

onMounted(() => window.addEventListener('auth:unauthorized', handleUnauthorized));
onBeforeUnmount(() => window.removeEventListener('auth:unauthorized', handleUnauthorized));
</script>

<template>
  <el-config-provider :locale="elLocale">
    <router-view />
    <div v-if="dbBusy" class="db-busy-mask" aria-busy="true">
      <span class="db-busy-indicator" />
    </div>
  </el-config-provider>
</template>
