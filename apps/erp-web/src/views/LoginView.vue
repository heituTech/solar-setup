<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { get } from '@/api/client';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const form = reactive({ username: '', password: '', captcha_id: '', captcha_code: '' });
const captcha = ref({ enabled: false, question: '' });

async function loadCaptcha() {
  try {
    const data = await get('/auth/captcha');
    captcha.value = data;
    form.captcha_id = data.captcha_id;
  } catch { /* 验证码接口异常时不影响登录 */ }
}

async function submit() {
  if (!form.username || !form.password) return ElMessage.warning('请输入账号和密码');
  try {
    await auth.login({ ...form });
    ElMessage.success('登录成功');
    router.replace(route.query.redirect || '/dashboard');
  } catch (error) {
    ElMessage.error(error.code === 'invalid_credentials' ? '账号或密码错误' : (error.message || '登录失败'));
    if (captcha.value.enabled) loadCaptcha();
  }
}

onMounted(async () => {
  await loadCaptcha();
  if (auth.token) {
    const ok = await auth.refresh();
    if (ok) router.replace('/dashboard');
  }
});
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">光伏工程一体化 ERP</div>
      <div class="muted" style="margin:6px 0 20px">门店销售 · 项目工单 · 领料施工 · 财务质保</div>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="账号"><el-input v-model="form.username" placeholder="请输入账号" /></el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" @keyup.enter="submit" />
        </el-form-item>
        <el-form-item v-if="captcha.enabled" :label="`验证码：${captcha.question}`">
          <el-input v-model="form.captcha_code" placeholder="请输入计算结果" />
        </el-form-item>
        <el-button type="primary" style="width:100%" :loading="auth.loading" @click="submit">登录</el-button>
      </el-form>
      <div class="muted" style="margin-top:16px;line-height:1.8">
        演示账号：admin/admin123（管理员）<br />
        manager/manager123（店长）、clerk/clerk123（店员）<br />
        engineer/engineer123（工程师）、captain/captain123（队长）
      </div>
    </div>
  </div>
</template>
