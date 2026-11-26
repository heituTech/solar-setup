<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { get, post } from '@/api/client';

const list = ref([]);
const total = ref(0);
const filters = reactive({ unread: '', page: 1, page_size: 10 });
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await get(`/notifications?page=${filters.page}&page_size=${filters.page_size}&unread=${filters.unread}`);
    list.value = data.items;
    total.value = data.total;
  } finally { loading.value = false; }
}
async function markRead(row) {
  try {
    await post(`/notifications/${row.id}/read`);
    await load();
  } catch (error) { ElMessage.error(error.message); }
}
async function markAll() {
  try {
    await post('/notifications/read-all');
    ElMessage.success('已全部标记为已读');
    await load();
  } catch (error) { ElMessage.error(error.message); }
}
onMounted(load);
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-title">消息中心</div>
      <el-button @click="markAll">全部已读</el-button>
    </div>
    <div class="filters">
      <el-radio-group v-model="filters.unread" @change="filters.page = 1; load()">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="1">未读</el-radio-button>
      </el-radio-group>
    </div>
    <el-table :data="list" v-loading="loading" border size="small">
      <el-table-column label="" width="60">
        <template #default="{ row }"><el-badge is-dot :hidden="Boolean(row.is_read)" /></template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="200" />
      <el-table-column prop="content" label="内容" min-width="320" />
      <el-table-column prop="type" label="类型" width="100" />
      <el-table-column prop="created_at" label="时间" width="170" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button v-if="!row.is_read" size="small" text type="primary" @click="markRead(row)">标为已读</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="mt12" layout="total, prev, pager, next" :total="total" :page-size="filters.page_size"
      v-model:current-page="filters.page" @current-change="load" />
  </div>
</template>
