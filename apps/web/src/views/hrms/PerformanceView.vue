<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('performanceReport') }}</h3>
      <div class="toolbar-actions">
        <el-date-picker v-model="period" type="month" value-format="YYYY-MM" :placeholder="t('month')" @change="reload" />
        <el-button @click="reload" :loading="loading">{{ t('refresh') }}</el-button>
        <el-button type="primary" :loading="sending" @click="send('personal')">{{ t('sendPersonalReport') }}</el-button>
        <el-button :loading="sending" @click="send('team')">{{ t('sendTeamReport') }}</el-button>
        <el-button :loading="sending" @click="send('all')">{{ t('sendAllReports') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
        <div style="padding:16px;background:#f6f8f7;border-radius:8px">
          <div style="color:#666;font-size:12px">{{ t('totalSales') }}</div>
          <div style="font-size:22px;font-weight:600">{{ money(team.total_sales) }}</div>
        </div>
        <div style="padding:16px;background:#f6f8f7;border-radius:8px">
          <div style="color:#666;font-size:12px">{{ t('totalReceived') }}</div>
          <div style="font-size:22px;font-weight:600">{{ money(team.total_received) }}</div>
        </div>
        <div style="padding:16px;background:#f6f8f7;border-radius:8px">
          <div style="color:#666;font-size:12px">{{ t('newCustomers') }}</div>
          <div style="font-size:22px;font-weight:600">{{ team.new_customers || 0 }}</div>
        </div>
        <div style="padding:16px;background:#f6f8f7;border-radius:8px">
          <div style="color:#666;font-size:12px">{{ t('champion') }}</div>
          <div style="font-size:18px;font-weight:600">{{ championText }}</div>
        </div>
      </div>
      <p style="color:#999;font-size:12px;margin-top:12px">{{ t('performanceHint') }}</p>
    </div>

    <div class="panel section-gap">
      <div class="filter-row">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="rows" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="name" :label="t('salesperson')" min-width="130" />
        <el-table-column :label="t('totalSales')" width="130">
          <template #default="{ row }">{{ money(row.order_amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('totalReceived')" width="130">
          <template #default="{ row }">{{ money(row.received_amount) }}</template>
        </el-table-column>
        <el-table-column prop="new_customers" :label="t('newCustomers')" width="110" />
        <el-table-column prop="order_count" :label="t('orderCount')" width="100" />
        <el-table-column :label="t('estimatedCommission')" width="140">
          <template #default="{ row }">{{ money(row.commission) }}</template>
        </el-table-column>
        <el-table-column :label="t('estimatedPayable')" width="140">
          <template #default="{ row }">{{ money(row.estimated_payable) }}</template>
        </el-table-column>
        <el-table-column :label="t('actualSettlement')" width="150">
          <template #default="{ row }">
            <span v-if="row.actual_settlement">{{ money(row.actual_settlement.payable) }}（{{ row.actual_settlement.status }}）</span>
            <span v-else style="color:#999">-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('champion')" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.is_champion" type="success">{{ t('champion') }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPage" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get, post } from '../../api/client';
import { currentPeriod, money } from '../../utils/format';

const { t } = useI18n();
const period = ref(currentPeriod());
const rows = ref([]);
const team = ref({});
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '' });
const loading = ref(false);
const sending = ref(false);

const championText = computed(() => {
  const champion = team.value.champion;
  if (!champion) return '-';
  return `${champion.name || champion.salesperson_id}（${money(champion.value)}）`;
});

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.set('period', period.value);
    params.set('page', page.value);
    params.set('page_size', pageSize.value);
    if (filters.q) params.set('q', filters.q);
    const data = await get(`/pv/api/hrms/performance?${params.toString()}`);
    rows.value = data.rows || [];
    team.value = data.team || {};
    total.value = data.total || 0;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function onPage(value) {
  page.value = value;
  load();
}

function reload() {
  page.value = 1;
  return load();
}

function resetFilters() {
  filters.q = '';
  reload();
}

async function send(type) {
  sending.value = true;
  try {
    const data = await post('/pv/api/hrms/report/send', { period: period.value, type });
    const summary = data.summary || {};
    ElMessage.success(t('emailSentSummary', { sent: summary.sent || 0, skipped: summary.skipped || 0, failed: summary.failed || 0 }));
    if (summary.errors && summary.errors.length) {
      ElMessage.warning(summary.errors.map((item) => item.error).join('; '));
    }
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    sending.value = false;
  }
}

onMounted(load);
</script>
