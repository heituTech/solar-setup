<template>
  <div class="auth-card">
    <el-card shadow="never">
      <template #header>
        <div class="auth-header">
          <strong>{{ t('login') }}</strong>
          <el-select :model-value="locale" size="small" style="width: 110px" @change="changeLocale">
            <el-option v-for="[code, label] in languages" :key="code" :value="code" :label="label" />
          </el-select>
        </div>
      </template>
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item :label="t('identifier')">
          <el-input v-model="form.identifier" autocomplete="username" />
        </el-form-item>
        <el-form-item :label="t('password')">
          <el-input v-model="form.password" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-button type="primary" style="width: 100%" :loading="auth.loading" @click="submit">{{ t('login') }}</el-button>
      </el-form>
      <div class="auth-switch">
        {{ t('register') }}? <router-link to="/register">{{ t('register') }}</router-link>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../../stores/auth';
import { languages } from '../../locales';

const { t, locale } = useI18n();

function changeLocale(code) {
  locale.value = code;
  localStorage.setItem('lang', code);
  document.documentElement.lang = code;
}
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const form = reactive({ identifier: '', password: '' });

async function submit() {
  if (!form.identifier || !form.password) {
    ElMessage.warning(t('identifier') + ' / ' + t('password'));
    return;
  }
  try {
    await auth.login({ identifier: form.identifier, password: form.password });
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
    router.push(redirect || (auth.staff ? '/workbench' : '/cases'));
  } catch (error) {
    ElMessage.error(error.message);
  }
}
</script>

<style scoped>
.auth-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
