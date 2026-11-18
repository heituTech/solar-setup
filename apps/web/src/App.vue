<script setup>
// Layout 由 router 的父级组件提供
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import en from 'element-plus/es/locale/lang/en';
import { dbBusy } from './api/client';

const { locale } = useI18n();
const elLocale = computed(() => (locale.value === 'zh' ? zhCn : en));
</script>

<template>
  <el-config-provider :locale="elLocale">
    <router-view />
    <div v-if="dbBusy" class="db-busy-mask" aria-busy="true">
      <span class="db-busy-indicator" />
    </div>
  </el-config-provider>
</template>
