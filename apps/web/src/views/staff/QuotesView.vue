<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('quotes') }}</h3>
      <div class="toolbar-actions">
        <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
        <el-button v-if="canSell" type="primary" :disabled="loading" @click="openCreate">{{ t('newQuote') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <div class="filter-row">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
        <el-select v-model="filters.status" clearable :placeholder="t('status')" style="width:150px">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="s in ['draft','pending_review','approved','rejected','accepted','converted']" :key="s" :label="statusLabel(s)" :value="s" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="quotes" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="quote_no" :label="t('quoteNumber')" width="190" />
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="140" />
        <el-table-column :label="t('total')" width="140">
          <template #default="{ row }">{{ money(row.total_amount, row.currency) }}</template>
        </el-table-column>
        <el-table-column :label="t('systemTotal')" width="140">
          <template #default="{ row }">
            <span v-if="row.system_total !== null">{{ money(row.system_total, row.currency) }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('suggestedPrice')" width="140">
          <template #default="{ row }">
            <span v-if="row.suggested_price !== null" style="color:#e6a23c;font-weight:600">{{ money(row.suggested_price, row.currency) }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('items')" width="80">
          <template #default="{ row }">{{ row.items.length }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="150">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="320">
          <template #default="{ row }">
            <el-button link @click="viewDetail(row)">{{ t('detail') }}</el-button>
            <el-button v-if="row.status === 'draft' && canSell" link type="primary" :disabled="saving" @click="submit(row)">{{ t('submitReview') }}</el-button>
            <template v-if="row.status === 'pending_review' && isManager">
              <el-button link type="success" :disabled="saving" @click="approve(row, 'approved')">{{ t('approve') }}</el-button>
              <el-button link type="danger" :disabled="saving" @click="approve(row, 'rejected')">{{ t('reject') }}</el-button>
            </template>
            <el-button v-if="row.status === 'approved' && canSell" link type="primary" :disabled="saving" @click="accept(row)">{{ t('accept') }}</el-button>
            <el-button v-if="row.status === 'accepted' && canSell" link type="success" :disabled="saving" @click="convert(row)">{{ t('convertOrder') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPage" />
    </div>

    <el-dialog v-model="dialog" :title="t('newQuote')" width="720px">
      <el-form :model="form" label-position="top">
        <el-form-item :label="t('selectCustomer')">
          <el-select v-model="form.customer_id" filterable style="width: 100%">
            <el-option v-for="item in customers" :key="item.id" :value="item.id" :label="`${item.name} · ${item.phone || ''}`" />
          </el-select>
        </el-form-item>
        <div v-for="(item, index) in form.items" :key="index" class="item-row">
          <el-input v-model="item.name" :placeholder="t('product')" />
          <el-input-number v-model="item.qty" :min="1" :controls="false" style="width:100%" />
          <el-input-number v-model="item.unit_price" :min="0" :controls="false" style="width:100%" />
          <el-button link type="danger" @click="form.items.splice(index, 1)">{{ t('delete') }}</el-button>
        </div>
        <div class="toolbar-actions section-gap">
          <el-button @click="form.items.push({ name: '', qty: 1, unit_price: 0 })">{{ t('addItem') }}</el-button>
          <strong>{{ t('total') }}: {{ money(formTotal) }}</strong>
        </div>
        <el-form-item :label="t('systemTotal')">
          <el-input-number v-model="form.system_total" :min="0" :controls="false" style="width:100%" :placeholder="t('systemTotal')" />
        </el-form-item>
        <el-form-item :label="t('suggestedPrice')">
          <el-input-number v-model="form.suggested_price" :min="0" :controls="false" style="width:100%" :placeholder="t('suggestedPriceHint')" />
        </el-form-item>
        <el-form-item v-if="showDiffReason" :label="t('diffReason')" required>
          <el-input v-model="form.diff_reason" type="textarea" :rows="2" :placeholder="t('diffReasonRequired')" />
        </el-form-item>
        <el-form-item :label="t('notes')" class="section-gap">
          <el-input v-model="form.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 报价详情 drawer（含明细 + 系统总造价 + 建议价 + 差异原因） -->
    <el-drawer v-model="drawer" :title="t('viewQuoteDetail')" size="640px">
      <template v-if="currentQuote">
        <div class="detail-grid">
          <div class="detail-item"><span>{{ t('quoteNumber') }}</span>{{ currentQuote.quote_no }}</div>
          <div class="detail-item"><span>{{ t('customerName') }}</span>{{ currentQuote.customer_name }}</div>
          <div class="detail-item"><span>{{ t('status') }}</span><el-tag :type="statusType(currentQuote.status)">{{ statusLabel(currentQuote.status) }}</el-tag></div>
          <div class="detail-item"><span>{{ t('date') }}</span>{{ dt(currentQuote.created_at) }}</div>
          <div class="detail-item"><span>{{ t('systemTotal') }}</span><strong>{{ currentQuote.system_total !== null ? money(currentQuote.system_total, currentQuote.currency) : '-' }}</strong></div>
          <div class="detail-item"><span>{{ t('suggestedPrice') }}</span>
            <strong v-if="currentQuote.suggested_price !== null" style="color:#e6a23c">{{ money(currentQuote.suggested_price, currentQuote.currency) }}</strong>
            <span v-else>-</span>
          </div>
          <div v-if="currentQuote.diff_reason" class="detail-item span-2">
            <span>{{ t('diffReason') }}</span>
            <el-alert type="warning" :closable="false">{{ currentQuote.diff_reason }}</el-alert>
          </div>
          <div v-if="currentQuote.notes" class="detail-item span-2"><span>{{ t('notes') }}</span>{{ currentQuote.notes }}</div>
        </div>
        <div class="panel-title" style="margin-top:16px"><h3>{{ t('items') }}</h3></div>
        <el-table :data="currentQuote.items" size="small">
          <el-table-column prop="name" :label="t('product')" min-width="200" />
          <el-table-column prop="qty" :label="t('quantity')" width="80" />
          <el-table-column :label="t('unitPrice')" width="120">
            <template #default="{ row }">{{ money(row.unit_price, currentQuote.currency) }}</template>
          </el-table-column>
          <el-table-column :label="t('subtotal')" width="120">
            <template #default="{ row }">{{ money(row.qty * row.unit_price, currentQuote.currency) }}</template>
          </el-table-column>
        </el-table>
        <div style="text-align:right;margin-top:12px;font-size:16px">
          <strong>{{ t('total') }}: {{ money(currentQuote.total_amount, currentQuote.currency) }}</strong>
        </div>
        <div v-if="currentQuote.status === 'pending_review' && isManager" style="margin-top:24px;text-align:right">
          <el-button type="danger" :loading="saving" @click="approve(currentQuote, 'rejected'); drawer = false">{{ t('reject') }}</el-button>
          <el-button type="success" :loading="saving" @click="approve(currentQuote, 'approved'); drawer = false">{{ t('approve') }}</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt, money, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const quotes = ref([]);
const customers = ref([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '' });
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const drawer = ref(false);
const currentQuote = ref(null);
const form = reactive({
  customer_id: null, items: [{ name: '', qty: 1, unit_price: 0 }], notes: '',
  system_total: null, suggested_price: null, diff_reason: '',
});

const canSell = computed(() => ['super_admin', 'sales_manager', 'salesperson'].includes(auth.role));
const isManager = computed(() => ['super_admin', 'sales_manager'].includes(auth.role));
const formTotal = computed(() => form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0));
const showDiffReason = computed(() => {
  if (form.suggested_price === null || form.suggested_price === undefined) return false;
  if (form.system_total === null || form.system_total === undefined) return false;
  return Math.abs(Number(form.suggested_price) - Number(form.system_total)) > 0.001;
});

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: '10' });
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.status) params.set('status', filters.status);
    const [quoteData, customerData] = await Promise.all([
      get(`/pv/api/workbench/quotes?${params.toString()}`),
      get('/pv/api/workbench/customers?page=1&page_size=100'),
    ]);
    quotes.value = quoteData.quotes || [];
    total.value = quoteData.total || 0;
    customers.value = customerData.customers || [];
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
  load();
}

function resetFilters() {
  filters.q = '';
  filters.status = '';
  reload();
}

function openCreate() {
  Object.assign(form, {
    customer_id: null, items: [{ name: '', qty: 1, unit_price: 0 }], notes: '',
    system_total: null, suggested_price: null, diff_reason: '',
  });
  dialog.value = true;
}

function viewDetail(row) {
  currentQuote.value = row;
  drawer.value = true;
}

async function save() {
  if (!form.customer_id) return ElMessage.warning(t('selectCustomer'));
  const items = form.items.filter((item) => item.name && item.unit_price > 0);
  if (!items.length) return ElMessage.warning(t('items'));
  if (showDiffReason.value && !form.diff_reason.trim()) return ElMessage.warning(t('diffReasonRequired'));
  saving.value = true;
  try {
    await post('/pv/api/workbench/quotes', {
      customer_id: form.customer_id, items, notes: form.notes,
      system_total: form.system_total, suggested_price: form.suggested_price, diff_reason: form.diff_reason,
    });
    ElMessage.success(t('operationSuccess'));
    dialog.value = false;
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function submit(row) {
  saving.value = true;
  try {
    await post(`/pv/api/workbench/quotes/${row.id}/submit`, {});
    await reload();
  } catch (error) { ElMessage.error(error.message); } finally { saving.value = false; }
}

async function approve(row, decision) {
  saving.value = true;
  try {
    await post(`/pv/api/workbench/quotes/${row.id}/approve`, { decision });
    await reload();
  } catch (error) { ElMessage.error(error.message); } finally { saving.value = false; }
}

async function accept(row) {
  saving.value = true;
  try {
    await ElMessageBox.confirm(`${t('accept')} ${row.quote_no}?`, t('confirm'));
    await post(`/pv/api/workbench/quotes/${row.id}/accept`, {});
    await reload();
  } catch (error) { if (error?.message) ElMessage.error(error.message); } finally { saving.value = false; }
}

async function convert(row) {
  saving.value = true;
  try {
    await ElMessageBox.confirm(`${t('convertOrder')} ${row.quote_no}?`, t('confirm'));
    const data = await post(`/pv/api/workbench/quotes/${row.id}/convert`, {});
    ElMessage.success(`${t('orders')}: ${data.order.order_no}`);
    await reload();
  } catch (error) { if (error?.message) ElMessage.error(error.message); } finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.detail-item span { display: block; color: #909399; font-size: 12px; margin-bottom: 4px; }
.detail-item.span-2 { grid-column: span 2; }
.muted { color: #909399; }

@media (max-width: 768px) {
  .detail-grid { grid-template-columns: 1fr; }
  .detail-item.span-2 { grid-column: span 1; }
}
</style>
