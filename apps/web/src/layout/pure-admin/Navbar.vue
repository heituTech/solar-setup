<script setup>
import { computed } from 'vue';
import { Fold, Expand, Menu } from '@element-plus/icons-vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAppStoreHook } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useSettingStoreHook } from '@/stores/settings';
import { routerArrays } from './menu';

const { t } = useI18n();
const appStore = useAppStoreHook();
const auth = useAuthStore();
const settingStore = useSettingStoreHook();
const route = useRoute();

const device = computed(() => appStore.device);
const username = computed(() => auth.user?.name || 'User');

const breadcrumb = computed(() => {
  const match = routerArrays.find((m) => m.path === route.path);
  return match ? match.meta.title : t('workspace');
});

function toggleSideBar() {
  appStore.toggleSideBar();
}

function logout() {
  auth.logout();
}
</script>

<template>
  <div class="navbar">
    <div class="hamburger-container" @click="toggleSideBar">
      <el-icon class="hamburger">
        <Fold v-if="appStore.sidebar.opened && device !== 'mobile'" />
        <Expand v-else-if="device !== 'mobile'" />
        <Menu v-else />
      </el-icon>
    </div>

    <div class="breadcrumb-container">
      <span class="breadcrumb-text">{{ breadcrumb }}</span>
    </div>

    <div class="navbar-right">
      <el-dropdown trigger="click">
        <span class="el-dropdown-link">
          <el-avatar :size="24" style="background: #1f7a4d">{{ username.charAt(0) }}</el-avatar>
          <span class="username">{{ username }}</span>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="logout">{{ t('logout') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.navbar {
  display: flex;
  align-items: center;
  width: 100%;
  height: 50px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.hamburger-container {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 16px;
  cursor: pointer;

  .hamburger {
    font-size: 18px;
  }
}

.breadcrumb-container {
  flex: 1;
  margin-left: 8px;
}

.breadcrumb-text {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.navbar-right {
  display: flex;
  align-items: center;
  padding-right: 16px;
}

.el-dropdown-link {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.username {
  font-size: 14px;
  color: #303133;
}
</style>
