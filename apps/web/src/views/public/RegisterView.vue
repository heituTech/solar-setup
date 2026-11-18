<template>
  <div class="auth-card">
    <el-card shadow="never">
      <template #header>
        <div class="auth-header">
          <strong>{{ t('register') }}</strong>
          <el-select :model-value="locale" size="small" style="width: 110px" @change="changeLocale">
            <el-option v-for="[code, label] in languages" :key="code" :value="code" :label="label" />
          </el-select>
        </div>
      </template>
      <el-form :model="form" label-position="top">
        <el-form-item :label="t('name')">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('email')">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item :label="t('phone')">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item :label="t('password')">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-button type="primary" style="width: 100%" :loading="loading" @click="submit">{{ t('register') }}</el-button>
      </el-form>
      <div class="auth-switch">
        {{ t('login') }}? <router-link to="/login">{{ t('login') }}</router-link>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { post } from '../../api/client';
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
const loading = ref(false);
const form = reactive({ name: '', email: '', phone: '', password: '' });

async function submit() {
  if (!form.name || (!form.email && !form.phone)) {
    ElMessage.warning(t('email') + ' / ' + t('phone'));
    return;
  }
  if (form.password.length < 8) {
    ElMessage.warning(t('password') + ' >= 8');
    return;
  }
  loading.value = true;
  try {
    const data = await post('/pv/api/auth/register', form);
    auth.saveSession(data);
    ElMessage.success(t('operationSuccess'));
    router.push('/cases');
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}
</script>
