<template>
  <div>
    <div class="page-toolbar section-gap">
      <h3>{{ t('monthlySettlement') }}</h3>
      <div class="toolbar-actions">
        <el-date-picker v-model="periodValue" type="month" value-format="YYYY-MM" :placeholder="t('month')" />
        <el-button v-if="canFinance" type="primary" :disabled="loading" @click="generate">{{ t('generateSettlement') }}</el-button>
        <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <div class="filter-row">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
        <el-select v-model="filters.status" clearable :placeholder="t('status')" style="width:160px">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="s in statusOptions" :key="s" :label="statusLabel(s)" :value="s" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="settlements" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="period" :label="t('month')" width="110" />
        <el-table-column prop="user_name" :label="t('name')" min-width="130" />
        <el-table-column :label="t('baseSalary')" width="120">
          <template #default="{ row }">{{ money(row.base_salary) }}</template>
        </el-table-column>
        <el-table-column :label="t('depositCommission')" width="130">
          <template #default="{ row }">{{ money(row.deposit_commission_total) }}</template>
        </el-table-column>
        <el-table-column :label="t('settlementCommission')" width="130">
          <template #default="{ row }">{{ money(row.settlement_commission_total) }}</template>
        </el-table-column>
        <el-table-column :label="t('commissionSubtotal')" width="130">
          <template #default="{ row }">{{ money(row.commission_total) }}</template>
        </el-table-column>
        <el-table-column :label="t('firstOrderReward')" width="110">
          <template #default="{ row }">{{ money(row.first_order_reward) }}</template>
        </el-table-column>
        <el-table-column :label="t('referralReward')" width="110">
          <template #default="{ row }">{{ money(row.referral_reward) }}</template>
        </el-table-column>
        <el-table-column :label="t('diligenceReward')" width="110">
          <template #default="{ row }">{{ money(row.diligence_reward) }}</template>
        </el-table-column>
        <el-table-column :label="t('deduction')" width="110">
          <template #default="{ row }">{{ money(row.deduction_total) }}</template>
        </el-table-column>
        <el-table-column :label="t('total')" width="130">
          <template #default="{ row }">{{ money(row.payable) }}</template>
        </el-table-column>
        <el-table-column :label="t('payoutStatus')" width="120">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="260">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="loading || saving" @click="openDetail(row)">{{ t('viewDetail') }}</el-button>
            <el-button v-if="canFinance && row.status === 'draft'" link type="success" :disabled="loading || saving" @click="confirm(row)">{{ t('confirm') }}</el-button>
            <el-button v-if="canFinance && row.status === 'confirmed'" link type="success" :disabled="loading || saving" @click="pay(row)">{{ t('payout') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPage" />
    </div>

    <el-drawer v-model="drawer" :title="t('payrollSnapshot')" size="560px">
      <div v-if="detail.settlement" class="detail-grid">
        <div class="detail-item"><span>{{ t('name') }}</span>{{ detail.settlement.user_name }}</div>
        <div class="detail-item"><span>{{ t('month') }}</span>{{ detail.settlement.period }}</div>
        <div class="detail-item"><span>{{ t('baseSalary') }}</span>{{ money(detail.settlement.base_salary) }}</div>
        <div class="detail-item"><span>{{ t('depositCommission') }}</span>{{ money(detail.settlement.deposit_commission_total) }}</div>
        <div class="detail-item"><span>{{ t('settlementCommission') }}</span>{{ money(detail.settlement.settlement_commission_total) }}</div>
        <div class="detail-item"><span>{{ t('commissionSubtotal') }}</span>{{ money(detail.settlement.commission_total) }}</div>
        <div class="detail-item"><span>{{ t('firstOrderReward') }}</span>{{ money(detail.settlement.first_order_reward) }}</div>
        <div class="detail-item"><span>{{ t('referralReward') }}</span>{{ money(detail.settlement.referral_reward) }}</div>
        <div class="detail-item"><span>{{ t('diligenceReward') }}</span>{{ money(detail.settlement.diligence_reward) }}</div>
        <div class="detail-item"><span>{{ t('deduction') }}</span>{{ money(detail.settlement.deduction_total) }}</div>
        <div class="detail-item"><span>{{ t('total') }}</span>{{ money(detail.settlement.payable) }}</div>
      </div>
      <div class="section-gap">
        <el-table :data="detail.items" size="small" :empty-text="t('noData')">
          <el-table-column :label="t('type')" width="120">
            <template #default="{ row }">{{ statusLabel(row.kind) }}</template>
          </el-table-column>
          <el-table-column prop="order_no" :label="t('orderNumber')" width="180" />
          <el-table-column :label="t('amount')" width="120">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="note" :label="t('notes')" />
        </el-table>
      </div>
      <div class="section-gap">
        <el-table :data="detail.payouts" size="small" :empty-text="t('noData')">
          <el-table-column :label="t('type')" width="120">
            <template #default="{ row }">{{ statusLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column :label="t('amount')" width="120">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column :label="t('date')">
            <template #default="{ row }">{{ dt(row.created_at) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { currentPeriod, dt, money, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const settlements = ref([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '' });
const statusOptions = ['draft', 'confirmed', 'paid'];
const loading = ref(false);
const saving = ref(false);
const periodValue = ref(currentPeriod());
const drawer = ref(false);
const detail = ref({ settlement: null, items: [], payouts: [] });

const canFinance = computed(() => ['super_admin', 'accountant'].includes(auth.role));

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.set('page', page.value);
    params.set('page_size', pageSize.value);
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    const data = await get(`/pv/api/workbench/settlements?${params.toString()}`);
    settlements.value = data.settlements || [];
    total.value = data.total || 0;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function onPage(p) {
  page.value = p;
  load();
}

function reload() {
  page.value = 1;
  return load();
}

function resetFilters() {
  filters.q = '';
  filters.status = '';
  reload();
}

async function generate() {
  saving.value = true;
  try {
    await post('/pv/api/workbench/settlements', { period: periodValue.value });
    ElMessage.success(t('operationSuccess'));
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function openDetail(row) {
  try {
    detail.value = await get(`/pv/api/workbench/settlements/${row.id}`);
    drawer.value = true;
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function confirm(row) {
  saving.value = true;
  try {
    await post(`/pv/api/workbench/settlements/${row.id}/confirm`, {});
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function pay(row) {
  saving.value = true;
  try {
    await ElMessageBox.confirm(`${t('payout')} ${row.user_name} ${money(row.payable)}?`, t('confirm'));
    await post(`/pv/api/workbench/settlements/${row.id}/pay`, { type: 'actual' });
    ElMessage.success(t('operationSuccess'));
    await reload();
  } catch (error) {
    if (error?.message) ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await load();
});
</script>
