<script setup>
import { computed, onMounted, ref } from 'vue';
import { Bell, Fold, Expand, Menu } from '@element-plus/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAppStoreHook } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useSettingStoreHook } from '@/stores/settings';
import { languages } from '@/locales';
import { get, post } from '@/api/client';
import { dt } from '@/utils/format';
import { routerArrays } from './menu';

const { t, locale } = useI18n();
const appStore = useAppStoreHook();
const auth = useAuthStore();
const settingStore = useSettingStoreHook();
const route = useRoute();
const router = useRouter();

const device = computed(() => appStore.device);
const username = computed(() => auth.user?.name || 'User');
const currentLanguage = computed(
  () => (languages.find(([code]) => code === locale.value) || languages[0])[1]
);
const canNotify = computed(() => auth.authenticated && auth.role !== 'member');
const notifications = ref([]);
const unread = ref(0);
const noticeVisible = ref(false);

async function loadNotifications() {
  if (!canNotify.value) return;
  try {
    const data = await get('/pv/api/notifications');
    notifications.value = data.notifications || [];
    unread.value = Number(data.unread || 0);
  } catch (error) {
    notifications.value = [];
    unread.value = 0;
  }
}

async function openNotice(item) {
  if (!item.is_read) {
    try {
      await post('/pv/api/notifications/read', { ids: [item.id] });
      item.is_read = true;
      unread.value = Math.max(0, unread.value - 1);
    } catch (error) {
      // 忽略已读标记失败
    }
  }
  if (item.link && item.link.startsWith('/')) {
    noticeVisible.value = false;
    router.push(item.link);
  }
}

async function markAllRead() {
  try {
    await post('/pv/api/notifications/read', { all: true });
    notifications.value.forEach((item) => { item.is_read = true; });
    unread.value = 0;
  } catch (error) {
    // 忽略
  }
}

onMounted(loadNotifications);

function changeLocale(code) {
  locale.value = code;
  localStorage.setItem('lang', code);
  document.documentElement.lang = code;
}

const breadcrumb = computed(() => {
  const match = routerArrays.find((m) => m.path === route.path);
  return match ? t(match.meta.key) : t('workspace');
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
      <el-popover
        v-if="canNotify"
        v-model:visible="noticeVisible"
        placement="bottom-end"
        :width="340"
        trigger="click"
        popper-class="notice-popover"
        @show="loadNotifications"
      >
        <template #reference>
          <span class="notice-trigger" :title="t('notifications')">
            <el-badge :value="unread" :max="99" :hidden="!unread">
              <el-icon :size="18"><Bell /></el-icon>
            </el-badge>
          </span>
        </template>
        <div class="notice-panel">
          <div class="notice-head">
            <span class="notice-head-title">{{ t('notifications') }}</span>
            <el-button link type="primary" size="small" :disabled="!unread" @click="markAllRead">
              {{ t('markAllRead') }}
            </el-button>
          </div>
          <div v-if="!notifications.length" class="notice-empty">{{ t('noNotifications') }}</div>
          <div
            v-for="item in notifications"
            :key="item.id"
            class="notice-item"
            :class="{ unread: !item.is_read }"
            @click="openNotice(item)"
          >
            <div class="notice-title">{{ item.title }}</div>
            <div class="notice-content">{{ item.content }}</div>
            <div class="notice-time">{{ dt(item.created_at) }}</div>
          </div>
        </div>
      </el-popover>

      <el-dropdown trigger="click" class="lang-dropdown" @command="changeLocale">
        <span class="el-dropdown-link lang-link">
          <span class="lang-label">{{ currentLanguage }}</span>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="[code, label] in languages"
              :key="code"
              :command="code"
              :disabled="code === locale"
            >
              {{ label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <template v-if="auth.authenticated">
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
      </template>
      <template v-else>
        <el-button size="small" @click="router.push('/login')">{{ t('login') }}</el-button>
        <el-button size="small" type="primary" @click="router.push('/register')">{{ t('register') }}</el-button>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: 1000;
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

.lang-dropdown {
  margin-right: 16px;
}

.lang-label {
  font-size: 13px;
  color: #606266;
  padding: 2px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  transition: all 0.2s;
}

.lang-link:hover .lang-label {
  color: #1f7a4d;
  border-color: #1f7a4d;
}

.notice-trigger {
  display: inline-flex;
  align-items: center;
  margin-right: 16px;
  color: #606266;
  cursor: pointer;
}

.notice-panel {
  max-height: 420px;
  overflow-y: auto;
}

.notice-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}

.notice-head-title {
  font-weight: 600;
  color: #303133;
}

.notice-empty {
  padding: 24px 0;
  text-align: center;
  color: #909399;
  font-size: 13px;
}

.notice-item {
  padding: 10px 4px;
  border-bottom: 1px solid #f2f3f5;
  cursor: pointer;
}

.notice-item.unread .notice-title::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  background: #e6a23c;
  vertical-align: middle;
}

.notice-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.notice-content {
  margin-top: 4px;
  font-size: 12px;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-word;
}

.notice-time {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>
