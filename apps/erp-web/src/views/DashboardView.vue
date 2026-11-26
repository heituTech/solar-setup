<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { get } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const data = ref({ statuses: [], sales_today: {}, receipts_today: {}, low_stock: 0, low_stock_items: [], outstanding: 0, outstanding_items: [] });
const loading = ref(false);

const STAGE = {
  created: '待勘测', surveying: '勘测中', surveyed: '已勘测', quoted: '已报价',
  contracted: '已签约', material_issued: '已领料', constructing: '施工中',
  constructed: '施工完成', accepted: '已验收待并网', grid_connected: '已并网',
  settled: '已结清', closed: '已闭环',
};
const money = (v) => `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function load() {
  loading.value = true;
  try { data.value = await get('/project/dashboard'); } finally { loading.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-header">
      <div>
        <div class="page-title">你好，{{ auth.user?.name }}</div>
        <div class="muted">今天的工作概览</div>
      </div>
      <div class="row-actions">
        <el-button v-if="auth.canSell" type="primary" @click="router.push('/sales')">门店开单</el-button>
        <el-button @click="router.push('/agent')">问 AI 助手</el-button>
      </div>
    </div>

    <div class="cards">
      <el-card shadow="never"><div class="muted">今日销售</div><div class="card-value">{{ money(data.sales_today.amount) }}</div><div class="muted">{{ data.sales_today.count || 0 }} 单</div></el-card>
      <el-card shadow="never"><div class="muted">今日收款</div><div class="card-value">{{ money(data.receipts_today.amount) }}</div><div class="muted">{{ data.receipts_today.count || 0 }} 笔</div></el-card>
      <el-card shadow="never"><div class="muted">待收款合计</div><div class="card-value" style="color:#e6a23c">{{ money(data.outstanding) }}</div><div class="muted">含逾期款项</div></el-card>
      <el-card shadow="never"><div class="muted">库存预警</div><div class="card-value" :style="{ color: data.low_stock ? '#f56c6c' : '#67c23a' }">{{ data.low_stock }}</div><div class="muted">低于安全库存</div></el-card>
    </div>

    <el-row :gutter="12">
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>项目阶段分布</template>
          <div v-if="!data.statuses.length" class="muted">暂无项目，先去门店开单生成工单。</div>
          <div v-for="row in data.statuses" :key="row.status" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #f0f0f0">
            <span>{{ STAGE[row.status] || row.status }}</span>
            <el-tag size="small">{{ row.total }}</el-tag>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>待收款项</template>
          <div v-if="!data.outstanding_items?.length" class="muted">暂无待收款项</div>
          <div v-for="row in data.outstanding_items" :key="row.id" style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #f0f0f0">
            <span>{{ row.project_no || '-' }} {{ row.name }}</span>
            <span style="color:#e6a23c">{{ money(Number(row.amount) - Number(row.received_amount)) }}</span>
          </div>
          <el-button v-if="auth.isManager" class="mt12" text type="primary" @click="router.push('/finance')">去处理收款</el-button>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="data.low_stock_items?.length" class="mt12" shadow="never">
      <template #header>库存预警明细</template>
      <div v-for="row in data.low_stock_items" :key="row.id" style="padding:6px 0;border-bottom:1px dashed #f0f0f0">
        {{ row.product_name }}（{{ row.store_name }}）库存 {{ row.qty }}{{ row.unit }} / 安全库存 {{ row.safety_qty }}
      </div>
    </el-card>
  </div>
</template>
