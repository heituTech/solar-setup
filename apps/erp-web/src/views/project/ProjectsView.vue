<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '@/api/client';
import { money, STAGE_LABEL, STAGE_TYPE } from '@/utils/format';

const router = useRouter();
const list = ref([]);
const total = ref(0);
const loading = ref(false);
const filters = reactive({ keyword: '', status: '', page: 1, page_size: 10 });

const STAGES = Object.entries(STAGE_LABEL).map(([value, label]) => ({ value, label }));

async function load() {
  loading.value = true;
  try {
    const data = await get(`/project/projects?page=${filters.page}&page_size=${filters.page_size}&keyword=${encodeURIComponent(filters.keyword)}&status=${filters.status}`);
    list.value = data.items;
    total.value = data.total;
  } finally { loading.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="page">
    <div class="page-header"><div class="page-title">项目工单</div></div>
    <div class="filters">
      <el-input v-model="filters.keyword" placeholder="项目编号 / 客户 / 电话" clearable style="width:240px" @keyup.enter="filters.page = 1; load()" />
      <el-select v-model="filters.status" placeholder="阶段" clearable style="width:160px" @change="filters.page = 1; load()">
        <el-option v-for="item in STAGES" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-button @click="filters.page = 1; load()">查询</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border stripe @row-click="(row) => router.push(`/projects/${row.id}`)">
      <el-table-column prop="project_no" label="项目编号" width="160" />
      <el-table-column prop="customer_name" label="客户" min-width="120" />
      <el-table-column prop="customer_address" label="安装地址" min-width="180" show-overflow-tooltip />
      <el-table-column label="阶段" width="130">
        <template #default="{ row }"><el-tag size="small" :type="STAGE_TYPE[row.status]">{{ STAGE_LABEL[row.status] || row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="surveyor_name" label="勘测工程师" width="120" />
      <el-table-column prop="captain_name" label="施工队长" width="110" />
      <el-table-column label="合同金额" width="130" align="right">
        <template #default="{ row }">{{ money(row.contract_amount) }}</template>
      </el-table-column>
      <el-table-column prop="store_name" label="门店" width="130" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click.stop="router.push(`/projects/${row.id}`)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="mt12" layout="total, prev, pager, next" :total="total" :page-size="filters.page_size"
      v-model:current-page="filters.page" @current-change="load" />
  </div>
</template>
