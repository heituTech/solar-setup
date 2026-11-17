<template>
  <div>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">{{ t('orderAmount') }}</div>
        <div class="kpi-value">{{ money(summary.order_amount) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('receivedAmount') }}</div>
        <div class="kpi-value">{{ money(summary.received_amount) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('outstanding') }}</div>
        <div class="kpi-value">{{ money(summary.outstanding) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('commissionDue') }}</div>
        <div class="kpi-value">{{ money(summary.commission_due) }}</div>
      </div>
    </div>

    <div class="page-toolbar">
      <el-tabs v-model="tab" style="width: 100%">
        <el-tab-pane :label="t('ledger')" name="ledger" />
        <el-tab-pane :label="t('payments')" name="payments" />
        <el-tab-pane :label="t('adjustments')" name="adjustments" />
      </el-tabs>
      <el-button v-if="tab === 'payments' && canFinance" type="primary" @click="openPayment">{{ t('recordPayment') }}</el-button>
      <el-button v-if="tab === 'adjustments' && canFinance" type="primary" @click="openAdjustment">{{ t('adjust') }}</el-button>
      <template v-if="tab === 'ledger' && canFinance">
        <el-date-picker v-model="exportPeriod" type="month" value-format="YYYY-MM" :placeholder="t('month')" />
        <el-button @click="exportLedger">{{ t('exportLedger') }}</el-button>
      </template>
    </div>

    <div v-show="tab === 'ledger'" class="panel">
      <el-table :data="ledger" v-loading="loading" empty-text="暂无记录">
        <el-table-column prop="order_no" :label="t('orderNumber')" width="190" />
        <el-table-column :label="t('dealDate')" width="120">
          <template #default="{ row }">{{ dateOnly(row.deal_date) }}</template>
        </el-table-column>
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="130" />
        <el-table-column prop="customer_phone" :label="t('phone')" width="140" />
        <el-table-column :label="t('customerType')" width="110">
          <template #default="{ row }">{{ row.customer_type === 'engineering' ? t('engineering') : t('retail') }}</template>
        </el-table-column>
        <el-table-column :label="t('orderType')" width="110">
          <template #default="{ row }">{{ row.order_type === 'engineering' ? t('engineering') : t('retail') }}</template>
        </el-table-column>
        <el-table-column prop="product_config" :label="t('productConfig')" min-width="180" show-overflow-tooltip />
        <el-table-column prop="salesperson_name" :label="t('owner')" width="120" />
        <el-table-column :label="t('orderAmount')" width="130">
          <template #default="{ row }">{{ money(row.order_amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('deposit')" width="130">
          <template #default="{ row }">{{ money(row.deposit_amount) }}<span v-if="row.deposit_received" class="muted"> ✓</span></template>
        </el-table-column>
        <el-table-column :label="t('balance')" width="130">
          <template #default="{ row }">{{ money(row.balance_amount) }}<span v-if="row.balance_received" class="muted"> ✓</span></template>
        </el-table-column>
        <el-table-column :label="t('receivedAmount')" width="130">
          <template #default="{ row }">{{ money(row.received_amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('outstanding')" width="130">
          <template #default="{ row }">{{ money(row.outstanding) }}</template>
        </el-table-column>
        <el-table-column :label="t('commissionDue')" width="130">
          <template #default="{ row }">{{ money(row.commission_due) }}</template>
        </el-table-column>
        <el-table-column :label="t('paidCommission')" width="130">
          <template #default="{ row }">{{ money(row.paid_commission) }}</template>
        </el-table-column>
        <el-table-column :label="t('pendingCommission')" width="130">
          <template #default="{ row }">{{ money(row.pending_commission) }}</template>
        </el-table-column>
        <el-table-column :label="t('deliveryDate')" width="120">
          <template #default="{ row }">{{ dateOnly(row.delivery_date) }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="130">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('acceptedAt')" width="160">
          <template #default="{ row }">{{ dt(row.accepted_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('referral')" min-width="140">
          <template #default="{ row }">{{ row.referral_flag ? (row.referral_name || '✓') : '' }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div v-show="tab === 'payments'" class="panel">
      <el-table :data="payments" empty-text="暂无记录">
        <el-table-column prop="order_no" :label="t('orderNumber')" width="190" />
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="130" />
        <el-table-column :label="t('amount')" width="130">
          <template #default="{ row }">{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('direction')" width="120">
          <template #default="{ row }"><el-tag :type="row.direction === 'in' ? 'success' : 'danger'">{{ row.direction === 'in' ? t('paymentIn') : t('paymentRefund') }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="method" :label="t('type')" width="110" />
        <el-table-column prop="reference" :label="t('reference')" width="140" />
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.received_at) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div v-show="tab === 'adjustments'" class="panel">
      <el-table :data="adjustments" empty-text="暂无记录">
        <el-table-column prop="salesperson_id" :label="t('owner')" width="110" />
        <el-table-column prop="type" :label="t('type')" width="120" />
        <el-table-column :label="t('amount')" width="130">
          <template #default="{ row }">{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="reason" :label="t('notes')" min-width="200" />
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="paymentDialog" :title="t('recordPayment')" width="520px">
      <el-form :model="paymentForm" label-position="top">
        <el-form-item :label="t('selectOrder')">
          <el-select v-model="paymentForm.order_id" filterable style="width: 100%">
            <el-option v-for="item in ledger" :key="item.order_id" :value="item.order_id" :label="`${item.order_no} · ${item.customer_name} · ${money(item.outstanding)}`" />
          </el-select>
        </el-form-item>
        <div class="form-grid">
          <el-form-item :label="t('amount')"><el-input-number v-model="paymentForm.amount" :min="0" style="width: 100%" /></el-form-item>
          <el-form-item :label="t('direction')">
            <el-select v-model="paymentForm.direction" style="width: 100%">
              <el-option :label="t('paymentIn')" value="in" />
              <el-option :label="t('paymentRefund')" value="refund" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('type')"><el-input v-model="paymentForm.method" /></el-form-item>
          <el-form-item :label="t('reference')"><el-input v-model="paymentForm.reference" /></el-form-item>
          <el-form-item class="span-2" :label="t('notes')"><el-input v-model="paymentForm.note" /></el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="paymentDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="savePayment">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="adjustDialog" :title="t('adjust')" width="520px">
      <el-form :model="adjustForm" label-position="top">
        <el-form-item :label="t('owner')">
          <el-select v-model="adjustForm.salesperson_id" filterable style="width: 100%">
            <el-option v-for="item in salespeople" :key="item.id" :value="item.id" :label="item.name" />
          </el-select>
        </el-form-item>
        <div class="form-grid">
          <el-form-item :label="t('type')">
            <el-select v-model="adjustForm.type" style="width: 100%">
              <el-option :label="t('firstOrderReward')" value="award" />
              <el-option :label="t('adjust')" value="penalty" />
              <el-option :label="t('recover')" value="recover" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('amount')"><el-input-number v-model="adjustForm.amount" :min="0" style="width: 100%" /></el-form-item>
          <el-form-item class="span-2" :label="t('notes')"><el-input v-model="adjustForm.reason" /></el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="adjustDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="saveAdjustment">{{ t('save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get, post, download } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { currentPeriod, dateOnly, dt, money, statusType } from '../../utils/format';

const { t } = useI18n();
const auth = useAuthStore();
const tab = ref('ledger');
const summary = ref({});
const ledger = ref([]);
const payments = ref([]);
const adjustments = ref([]);
const directory = ref([]);
const loading = ref(false);
const exportPeriod = ref(currentPeriod());
const paymentDialog = ref(false);
const adjustDialog = ref(false);
const paymentForm = reactive({ order_id: null, amount: 0, direction: 'in', method: 'bank', reference: '', note: '' });
const adjustForm = reactive({ salesperson_id: null, type: 'award', amount: 0, reason: '' });

const canFinance = computed(() => ['super_admin', 'accountant'].includes(auth.role));
const salespeople = computed(() => directory.value.filter((item) => ['salesperson', 'sales_manager'].includes(item.role)));

async function load() {
  loading.value = true;
  try {
    const results = await Promise.allSettled([
      get('/pv/api/workbench/finance/summary'),
      get('/pv/api/workbench/ledger'),
      get('/pv/api/workbench/payments'),
      get('/pv/api/workbench/adjustments'),
      get('/pv/api/workbench/directory'),
    ]);
    if (results[0].status === 'fulfilled') summary.value = results[0].value;
    if (results[1].status === 'fulfilled') ledger.value = results[1].value.ledger || [];
    if (results[2].status === 'fulfilled') payments.value = results[2].value.payments || [];
    if (results[3].status === 'fulfilled') adjustments.value = results[3].value.adjustments || [];
    if (results[4].status === 'fulfilled') directory.value = results[4].value.users || [];
    const failed = results.find((item) => item.status === 'rejected');
    if (failed) ElMessage.error(failed.reason.message);
  } finally {
    loading.value = false;
  }
}

function openPayment() {
  Object.assign(paymentForm, { order_id: null, amount: 0, direction: 'in', method: 'bank', reference: '', note: '' });
  paymentDialog.value = true;
}

async function exportLedger() {
  try {
    await download(
      `/pv/api/workbench/ledger/export?period=${encodeURIComponent(exportPeriod.value || '')}`,
      `ledger-${exportPeriod.value || 'all'}.xlsx`
    );
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function savePayment() {
  if (!paymentForm.order_id || paymentForm.amount <= 0) return ElMessage.warning(t('amount'));
  try {
    await post('/pv/api/workbench/payments', paymentForm);
    ElMessage.success(t('operationSuccess'));
    paymentDialog.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

function openAdjustment() {
  Object.assign(adjustForm, { salesperson_id: null, type: 'award', amount: 0, reason: '' });
  adjustDialog.value = true;
}

async function saveAdjustment() {
  if (!adjustForm.salesperson_id || adjustForm.amount <= 0 || !adjustForm.reason) return ElMessage.warning(t('notes'));
  try {
    await post('/pv/api/workbench/adjustments', adjustForm);
    adjustDialog.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

onMounted(load);
</script>
