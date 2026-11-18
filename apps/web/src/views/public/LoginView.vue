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

      <el-tabs v-model="mode">
        <el-tab-pane :label="t('loginByPassword')" name="password">
          <el-form :model="form" label-position="top" @submit.prevent="submitPassword">
            <el-form-item :label="t('loginIdentifier')">
              <el-input v-model="form.identifier" autocomplete="username" :placeholder="t('loginIdentifierPlaceholder')" />
            </el-form-item>
            <el-form-item :label="t('password')">
              <el-input v-model="form.password" type="password" show-password autocomplete="current-password" />
            </el-form-item>
            <el-button type="primary" style="width: 100%" :loading="auth.loading" @click="submitPassword">{{ t('login') }}</el-button>
          </el-form>
        </el-tab-pane>

        <el-tab-pane :label="t('loginByEmailCode')" name="code">
          <el-form :model="form" label-position="top" @submit.prevent="submitCode">
            <el-form-item :label="t('email')">
              <el-input v-model="form.email" type="email" autocomplete="email" />
            </el-form-item>
            <el-form-item :label="t('emailCode')">
              <div class="code-row">
                <el-input v-model="form.code" maxlength="6" autocomplete="one-time-code" />
                <el-button :disabled="countdown > 0" :loading="sending" @click="sendCode">
                  {{ countdown > 0 ? `${countdown}s` : t('sendCode') }}
                </el-button>
              </div>
            </el-form-item>
            <el-button type="primary" style="width: 100%" :loading="auth.loading" @click="submitCode">{{ t('login') }}</el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div class="auth-switch">
        {{ t('register') }}? <router-link to="/register">{{ t('register') }}</router-link>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
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
const route = useRoute();
const mode = ref('password');
const form = reactive({ identifier: '', password: '', email: '', code: '' });
const sending = ref(false);
const countdown = ref(0);
let timer = null;

function messageOf(error) {
  const key = `err_${error.code || ''}`;
  const text = t(key);
  return text === key ? error.message : text;
}

function goAfterLogin() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
  router.push(redirect || (auth.staff ? '/workbench' : '/cases'));
}

async function submitPassword() {
  if (!form.identifier || !form.password) {
    ElMessage.warning(t('err_credentials_required'));
    return;
  }
  try {
    await auth.login({ identifier: form.identifier, password: form.password });
    goAfterLogin();
  } catch (error) {
    ElMessage.error(messageOf(error));
  }
}

function startCountdown() {
  countdown.value = 60;
  clearInterval(timer);
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) clearInterval(timer);
  }, 1000);
}

async function sendCode() {
  if (!form.email) {
    ElMessage.warning(t('err_email_required'));
    return;
  }
  sending.value = true;
  try {
    await post('/pv/api/auth/email-code', { email: form.email });
    ElMessage.success(t('codeSent', { email: form.email }));
    startCountdown();
  } catch (error) {
    ElMessage.error(messageOf(error));
  } finally {
    sending.value = false;
  }
}

async function submitCode() {
  if (!form.email || !form.code) {
    ElMessage.warning(t('err_email_required'));
    return;
  }
  try {
    const data = await post('/pv/api/auth/login-code', { email: form.email, code: form.code });
    auth.saveSession(data);
    goAfterLogin();
  } catch (error) {
    ElMessage.error(messageOf(error));
  }
}

onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.auth-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.code-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.code-row .el-input {
  flex: 1;
}
</style>
