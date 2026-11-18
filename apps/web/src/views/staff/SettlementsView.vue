<template>
  <div>
    <div class="panel">
      <div class="panel-title">
        <h3>{{ t('settings') }}</h3>
        <el-button v-if="canFinance" link type="primary" :loading="savingConfig" @click="saveConfig">{{ t('save') }}</el-button>
      </div>
      <div class="form-grid">
        <el-form-item :label="`${t('commissionRate')} (%)`">
          <el-input-number v-model="configPercent.base_rate" :min="0" :max="100" :step="0.1" :disabled="!canFinance" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="`${t('referral')} (%)`">
          <el-input-number v-model="configPercent.referral_rate" :min="0" :max="100" :step="0.1" :disabled="!canFinance" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="`${t('commissionDue')} / ${t('remaining') || 'remaining'} (%)`">
          <el-input-number v-model="configPercent.remaining_rate" :min="0" :max="100" :step="1" :disabled="!canFinance" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('firstOrderReward')">
          <el-input-number v-model="config.first_order_reward" :min="0" :disabled="!canFinance" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('surveyReward')">
          <el-input-number v-model="config.survey_reward" :min="0" :disabled="!canFinance" style="width: 100%" />
        </el-form-item>
      </div>
    </div>

    <div class="page-toolbar section-gap">
      <h3>{{ t('monthlySettlement') }}</h3>
      <div class="toolbar-actions">
        <el-date-picker v-model="periodValue" type="month" value-format="YYYY-MM" :placeholder="t('month')" />
        <el-input-number v-model="baseSalary" :min="0" :placeholder="t('baseSalary')" />
        <el-button v-if="canFinance" type="primary" :disabled="loading" @click="generate">{{ t('generateSettlement') }}</el-button>
        <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <el-table :data="settlements" v-loading="loading" empty-text="暂无记录">
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
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="260">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="loading || saving" @click="openDetail(row)">{{ t('viewDetail') }}</el-button>
            <el-button v-if="canFinance && row.status === 'draft'" link type="success" :disabled="loading || saving" @click="confirm(row)">{{ t('confirm') }}</el-button>
            <el-button v-if="canFinance && row.status === 'confirmed'" link type="success" :disabled="loading || saving" @click="pay(row)">{{ t('payout') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
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
        <el-table :data="detail.items" size="small" empty-text="暂无记录">
          <el-table-column prop="kind" :label="t('type')" width="120" />
          <el-table-column prop="order_no" :label="t('orderNumber')" width="180" />
          <el-table-column :label="t('amount')" width="120">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="note" :label="t('notes')" />
        </el-table>
      </div>
      <div class="section-gap">
        <el-table :data="detail.payouts" size="small" empty-text="暂无记录">
          <el-table-column prop="type" :label="t('type')" width="120" />
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
import { get, post, put } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { currentPeriod, dt, money, statusType } from '../../utils/format';

const { t } = useI18n();
const auth = useAuthStore();
const settlements = ref([]);
const loading = ref(false);
const saving = ref(false);
const savingConfig = ref(false);
const periodValue = ref(currentPeriod());
const baseSalary = ref(300);
const drawer = ref(false);
const detail = ref({ settlement: null, items: [], payouts: [] });
const config = reactive({ base_rate: 0.03, remaining_rate: 0.7, referral_rate: 0.01, first_order_reward: 0, survey_reward: 0 });
const configPercent = reactive({ base_rate: 3, remaining_rate: 70, referral_rate: 1 });

const canFinance = computed(() => ['super_admin', 'accountant'].includes(auth.role));

async function loadConfig() {
  try {
    const data = await get('/pv/api/workbench/compensation-config');
    Object.assign(config, data.config);
    configPercent.base_rate = Number((data.config.base_rate * 100).toFixed(2));
    configPercent.remaining_rate = Number((data.config.remaining_rate * 100).toFixed(2));
    configPercent.referral_rate = Number((data.config.referral_rate * 100).toFixed(2));
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function saveConfig() {
  savingConfig.value = true;
  try {
    await put('/pv/api/workbench/compensation-config', {
      base_rate: configPercent.base_rate / 100,
      remaining_rate: configPercent.remaining_rate / 100,
      referral_rate: configPercent.referral_rate / 100,
      first_order_reward: config.first_order_reward,
      survey_reward: config.survey_reward,
    });
    ElMessage.success(t('operationSuccess'));
    await loadConfig();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    savingConfig.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const data = await get('/pv/api/workbench/settlements');
    settlements.value = data.settlements || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function generate() {
  saving.value = true;
  try {
    await post('/pv/api/workbench/settlements', { period: periodValue.value, base_salary: baseSalary.value });
    ElMessage.success(t('operationSuccess'));
    await load();
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
    await load();
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
    await load();
  } catch (error) {
    if (error?.message) ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadConfig(), load()]);
});
</script>
