<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { get } from '@/api/client';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const unread = ref(0);
const collapsed = ref(false);

const ROLE_LABEL = {
  admin: '管理员', store_manager: '店长', store_clerk: '门店店员',
  electrical_engineer: '电气工程师', structural_engineer: '结构工程师', construction_captain: '施工队长',
};

const MENUS = [
  { path: '/dashboard', label: '概览' },
  { path: '/sales', label: '门店销售', roles: ['admin', 'store_manager', 'store_clerk'] },
  { path: '/projects', label: '项目工单' },
  { path: '/inventory', label: '库存领料' },
  { path: '/finance', label: '财务应收', roles: ['admin', 'store_manager'] },
  { path: '/master', label: '主数据', roles: ['admin'] },
  { path: '/users', label: '账号管理', roles: ['admin'] },
  { path: '/agent', label: 'AI 助手' },
  { path: '/notifications', label: '消息中心' },
];

const menus = computed(() => MENUS.filter((menu) => !menu.roles || menu.roles.includes(auth.role)));
const activeMenu = computed(() => {
  if (route.path.startsWith('/projects')) return '/projects';
  return route.path;
});

async function loadUnread() {
  try { unread.value = (await get('/notifications/unread-count')).unread; } catch { /* ignore */ }
}
function logout() {
  auth.logout();
}
onMounted(() => {
  loadUnread();
  setInterval(loadUnread, 60000);
});
</script>

<template>
  <el-container style="height: 100%">
    <el-aside :width="collapsed ? '64px' : '200px'" style="background:#001529;transition:width .2s">
      <div style="height:56px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px">
        {{ collapsed ? 'PV' : '光伏工程 ERP' }}
      </div>
      <el-menu :default-active="activeMenu" :collapse="collapsed" router
        background-color="#001529" text-color="#c9d1d9" active-text-color="#fff">
        <el-menu-item v-for="menu in menus" :key="menu.path" :index="menu.path">{{ menu.label }}</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header style="background:#fff;display:flex;align-items:center;gap:12px;border-bottom:1px solid #ebeef5">
        <el-button text @click="collapsed = !collapsed">☰</el-button>
        <span style="font-weight:600">{{ route.meta.title || '概览' }}</span>
        <div style="flex:1"></div>
        <el-badge :value="unread" :hidden="!unread">
          <el-button text @click="router.push('/notifications')">消息</el-button>
        </el-badge>
        <el-dropdown>
          <span style="cursor:pointer">
            {{ auth.user?.name }}（{{ ROLE_LABEL[auth.role] || auth.role }}）
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>{{ auth.user?.username }}</el-dropdown-item>
              <el-dropdown-item divided @click="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main style="padding:0;overflow-y:auto">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
