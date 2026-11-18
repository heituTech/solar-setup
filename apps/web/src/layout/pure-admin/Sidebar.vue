<script setup>
import { computed } from 'vue';
import { Coin, DArrowLeft, DArrowRight } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { useAppStoreHook } from '@/stores/app';
import { useSettingStoreHook } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import { useRoute } from 'vue-router';
import { routerArrays } from './menu';

const { t } = useI18n();

const appStore = useAppStoreHook();
const pureSetting = useSettingStoreHook();
const auth = useAuthStore();
const route = useRoute();

const isCollapse = computed(() => !appStore.sidebar.opened);
const device = computed(() => appStore.device);
const menus = computed(() =>
  routerArrays.filter((m) => {
    if (m.meta.staff) return auth.staff;
    if (m.meta.requiresAuth) return auth.authenticated;
    return true;
  })
);

const defaultActive = computed(() => route.path);

function toggleSideBar() {
  appStore.toggleSideBar();
}
</script>

<template>
  <div
    class="sidebar-container has-logo"
    :class="{ 'is-horizontal': false }"
  >
    <div class="sidebar-logo-container">
      <transition name="sidebarLogoFade">
        <router-link to="/workbench" class="sidebar-logo-link" v-if="!isCollapse || device === 'mobile'">
          <span class="sidebar-logo-title">HEITU ERP</span>
        </router-link>
      </transition>
    </div>

    <el-scrollbar wrap-class="scrollbar-wrapper" :class="device === 'mobile' ? 'mobile' : 'pc'">
      <el-menu
        unique-opened
        mode="vertical"
        class="outer-most select-none"
        :collapse="isCollapse && device !== 'mobile'"
        :collapse-transition="false"
        :default-active="defaultActive"
      >
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          <el-icon><Coin /></el-icon>
          <template #title>{{ t(item.meta.key) }}</template>
        </el-menu-item>
      </el-menu>
    </el-scrollbar>

    <div
      v-if="device !== 'mobile'"
      class="sidebar-collapse-btn"
      @click="toggleSideBar"
    >
      <el-icon><DArrowLeft v-if="!isCollapse" /><DArrowRight v-else /></el-icon>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.sidebar-container {
  width: 210px;
  height: 100%;
  background: #001529;
  transition: width 0.28s;
  display: flex;
  flex-direction: column;

  &.has-logo {
    .sidebar-logo-container {
      height: 50px;
      line-height: 50px;
      text-align: center;
      overflow: hidden;
    }
  }
}

.sidebar-logo-link {
  text-decoration: none;
  display: block;
  height: 100%;
}

.sidebar-logo-title {
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 1px;
}

:deep(.el-menu) {
  border-right: none;
  background: #001529;
}

:deep(.el-menu-item) {
  color: rgba(255, 255, 255, 0.75);

  &.is-active {
    color: #fff;
    background: #1f7a4d;
  }

  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
}

.sidebar-collapse-btn {
  position: absolute;
  bottom: 0;
  width: 100%;
  height: 40px;
  line-height: 40px;
  text-align: center;
  cursor: pointer;
  color: #fff;
  background: #000c17;
  z-index: 10;
}

.sidebarLogoFade-enter-active,
.sidebarLogoFade-leave-active {
  transition: opacity 0.15s;
}
</style>
