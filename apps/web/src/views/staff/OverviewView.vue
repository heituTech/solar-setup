<template>
  <div v-loading="loading">
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">{{ t('customers') }}</div>
        <div class="kpi-value">{{ summary.customers?.total || 0 }}</div>
        <div class="kpi-hint">{{ t('leads') }} {{ summary.customers?.leads || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('orderAmount') }}</div>
        <div class="kpi-value">{{ money(finance.order_amount) }}</div>
        <div class="kpi-hint">{{ t('orders') }} {{ finance.orders || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('receivedAmount') }}</div>
        <div class="kpi-value">{{ money(finance.received_amount) }}</div>
        <div class="kpi-hint">{{ t('netReceived') }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('outstanding') }}</div>
        <div class="kpi-value">{{ money(finance.outstanding) }}</div>
        <div class="kpi-hint">{{ t('payment') }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('commissionDue') }}</div>
        <div class="kpi-value">{{ money(finance.commission_due) }}</div>
        <div class="kpi-hint">{{ t('finalAcceptance') }} + {{ t('payment') }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('projects') }}</div>
        <div class="kpi-value">{{ activeProjects }}</div>
        <div class="kpi-hint">{{ t('workspace') }}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">
        <h3>{{ t('orders') }}</h3>
        <el-button link type="primary" @click="$router.push('/workbench/orders')">{{ t('viewDetail') }}</el-button>
      </div>
      <el-table :data="orders.slice(0, 8)" empty-text="暂无记录">
        <el-table-column prop="order_no" :label="t('orderNumber')" width="190" />
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="140" />
        <el-table-column :label="t('amount')" width="140">
          <template #default="{ row }">{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('outstanding')" width="140">
          <template #default="{ row }">{{ money(row.outstanding) }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="160">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div class="panel">
      <div class="panel-title"><h3>{{ t('actions') }}</h3></div>
      <div class="toolbar-actions">
        <el-button :disabled="loading" @click="$router.push('/workbench/customers')">{{ t('newCustomer') }}</el-button>
        <el-button :disabled="loading" @click="$router.push('/workbench/surveys')">{{ t('newSurvey') }}</el-button>
        <el-button :disabled="loading" @click="$router.push('/workbench/quotes')">{{ t('newQuote') }}</el-button>
        <el-button :disabled="loading" @click="$router.push('/workbench/projects')">{{ t('projects') }}</el-button>
        <el-button :disabled="loading" @click="$router.push('/workbench/ledger')">{{ t('ledger') }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get } from '../../api/client';
import { dt, money, statusType } from '../../utils/format';

const { t } = useI18n();
const summary = ref({});
const finance = ref({});
const orders = ref([]);
const projects = ref([]);
const loading = ref(false);

const activeProjects = computed(() => projects.value.filter((item) => ['initializing', 'pending_assignment', 'in_delivery'].includes(item.status)).length);

async function load() {
  loading.value = true;
  try {
    const results = await Promise.allSettled([
      get('/pv/api/workbench/summary'),
      get('/pv/api/workbench/finance/summary'),
      get('/pv/api/workbench/orders'),
      get('/pv/api/workbench/projects'),
    ]);
    if (results[0].status === 'fulfilled') summary.value = results[0].value;
    if (results[1].status === 'fulfilled') finance.value = results[1].value;
    if (results[2].status === 'fulfilled') orders.value = results[2].value.orders || [];
    if (results[3].status === 'fulfilled') projects.value = results[3].value.projects || [];
    const failed = results.find((item) => item.status === 'rejected');
    if (failed) ElMessage.error(failed.reason.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
