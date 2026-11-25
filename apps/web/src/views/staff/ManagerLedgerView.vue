<template>
  <div>
    <div class="page-toolbar section-gap">
      <h3>{{ t('managerLedger') }}</h3>
      <div class="toolbar-actions">
        <el-date-picker v-model="periodValue" type="month" value-format="YYYY-MM" :placeholder="t('month')" @change="load" />
        <el-button v-if="canGenerate" type="primary" :loading="saving" @click="generate">{{ t('generateLedger') }}</el-button>
        <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
      </div>
    </div>

    <el-alert :title="t('managerLedgerHint')" type="info" :closable="false" class="section-gap" />

    <div class="panel">
      <el-table :data="ledger" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="period" :label="t('month')" width="100" />
        <el-table-column prop="manager_name" :label="t('name')" min-width="140" />
        <el-table-column prop="team_size" :label="t('teamSize')" width="110" />
        <el-table-column prop="order_count" :label="t('orderCount')" width="110" />
        <el-table-column :label="t('teamOrderAmount')" width="140">
          <template #default="{ row }">{{ money(row.order_amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('teamReceived')" width="140">
          <template #default="{ row }">{{ money(row.received_amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('teamRate')" width="110">
          <template #default="{ row }">{{ percent(row.commission_rate) }}</template>
        </el-table-column>
        <el-table-column :label="t('managerCommission')" width="130">
          <template #default="{ row }">{{ money(row.commission_amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('teamBonus')" width="120">
          <template #default="{ row }">{{ money(row.bonus_amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('baseSalary')" width="120">
          <template #default="{ row }">{{ money(row.base_salary) }}</template>
        </el-table-column>
        <el-table-column :label="t('total')" width="130">
          <template #default="{ row }">{{ money(row.total_payable) }}</template>
        </el-table-column>
        <el-table-column :label="t('date')" width="170">
          <template #default="{ row }">{{ dt(row.generated_at) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get, post } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { currentPeriod, dt, money } from '../../utils/format';

const { t } = useI18n();
const auth = useAuthStore();
const periodValue = ref(currentPeriod());
const ledger = ref([]);
const loading = ref(false);
const saving = ref(false);

const canGenerate = computed(() => auth.role === 'super_admin');

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

async function load() {
  loading.value = true;
  try {
    const data = await get(`/pv/api/workbench/manager-ledger?period=${periodValue.value}`);
    ledger.value = data.ledger || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function generate() {
  saving.value = true;
  try {
    await post('/pv/api/workbench/manager-ledger/generate', { period: periodValue.value });
    ElMessage.success(t('ledgerGenerated'));
    await load();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
