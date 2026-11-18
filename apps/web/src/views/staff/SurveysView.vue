<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('surveys') }}</h3>
      <div class="toolbar-actions">
        <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
        <el-button v-if="canEdit" type="primary" :disabled="loading" @click="openCreate">{{ t('newSurvey') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
        <el-select v-model="filters.status" clearable :placeholder="t('status')" style="width:150px">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="s in ['draft','submitted','reviewed','invalid']" :key="s" :label="statusLabel(s)" :value="s" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="surveys" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="130" />
        <el-table-column prop="address" :label="t('address')" min-width="160" />
        <el-table-column prop="roof_type" :label="t('roofType')" width="120" />
        <el-table-column prop="roof_area" :label="t('roofArea')" width="120" />
        <el-table-column :label="t('status')" width="120">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('constructionCost')" width="140">
          <template #default="{ row }">
            <span v-if="row.construction_cost !== null">{{ row.construction_cost }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="280">
          <template #default="{ row }">
            <el-button v-if="canEdit && row.status === 'draft'" link type="primary" :disabled="saving" @click="submitSurvey(row)">{{ t('submitReview') }}</el-button>
            <template v-if="canReview && row.status === 'submitted'">
              <el-button link type="success" :disabled="saving" @click="review(row, 'valid')">{{ t('valid') }}</el-button>
              <el-button link type="danger" :disabled="saving" @click="review(row, 'invalid')">{{ t('invalid') }}</el-button>
            </template>
            <el-button v-if="canReview && row.status === 'reviewed'" link type="primary" :disabled="saving" @click="fillCost(row)">{{ t('fillConstructionCost') }}</el-button>
            <el-button v-if="canEdit" link @click="linkOrder(row)">{{ t('linkOrder') }}</el-button>
            <span v-if="row.review_note" class="muted">{{ row.review_note }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPage" />
    </div>

    <el-dialog v-model="dialog" :title="t('newSurvey')" width="620px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item class="span-2" :label="t('selectCustomer')">
            <el-select v-model="form.customer_id" filterable style="width: 100%">
              <el-option v-for="item in customers" :key="item.id" :value="item.id" :label="`${item.name} · ${item.phone || ''}`" />
            </el-select>
          </el-form-item>
          <el-form-item class="span-2" :label="t('address')"><el-input v-model="form.address" /></el-form-item>
          <el-form-item :label="t('roofType')">
            <el-select v-model="form.roof_type" style="width: 100%">
              <el-option :label="t('rooftop')" value="rooftop" />
              <el-option :label="t('ground')" value="ground" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('roofArea')"><el-input-number v-model="form.roof_area" :min="0" style="width: 100%" /></el-form-item>
          <el-form-item :label="t('consumption')"><el-input-number v-model="form.monthly_consumption" :min="0" style="width: 100%" /></el-form-item>
          <el-form-item :label="t('notes')"><el-input v-model="form.note" /></el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const surveys = ref([]);
const customers = ref([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '' });
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const form = reactive({
  customer_id: null, address: '', roof_type: 'rooftop', roof_area: null, monthly_consumption: null, note: '',
});

const canEdit = computed(() => ['super_admin', 'sales_manager', 'salesperson'].includes(auth.role));
const canReview = computed(() => ['super_admin', 'electrical_engineer', 'structural_engineer'].includes(auth.role));

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: '10' });
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.status) params.set('status', filters.status);
    const [surveyData, customerData] = await Promise.all([
      get(`/pv/api/workbench/surveys?${params.toString()}`),
      get('/pv/api/workbench/customers?page=1&page_size=100'),
    ]);
    surveys.value = surveyData.surveys || [];
    total.value = surveyData.total || 0;
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
  Object.assign(form, { customer_id: null, address: '', roof_type: 'rooftop', roof_area: null, monthly_consumption: null, note: '' });
  dialog.value = true;
}

async function save() {
  if (!form.customer_id) return ElMessage.warning(t('selectCustomer'));
  saving.value = true;
  try {
    await post('/pv/api/workbench/surveys', {
      customer_id: form.customer_id,
      address: form.address,
      roof_type: form.roof_type,
      roof_area: form.roof_area,
      monthly_consumption: form.monthly_consumption,
      payload: { note: form.note },
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

async function submitSurvey(row) {
  saving.value = true;
  try {
    await post(`/pv/api/workbench/surveys/${row.id}/submit`, {});
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function review(row, decision) {
  saving.value = true;
  try {
    const { value } = await ElMessageBox.prompt(t('notes'), t('review'), { inputValue: '', inputPlaceholder: t('optional') });
    await post(`/pv/api/workbench/surveys/${row.id}/review`, { decision, note: value || null });
    ElMessage.success(t('operationSuccess'));
    await reload();
  } catch (error) {
    if (error?.message) ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function fillCost(row) {
  try {
    const { value } = await ElMessageBox.prompt(t('constructionCost'), t('fillConstructionCost'), {
      inputValue: row.construction_cost ?? '', inputType: 'number', inputPlaceholder: '0',
    });
    const cost = Number(value);
    if (!Number.isFinite(cost) || cost < 0) return ElMessage.warning(t('constructionCost'));
    await post(`/pv/api/workbench/surveys/${row.id}/construction-cost`, { construction_cost: cost });
    ElMessage.success(t('operationSuccess'));
    await reload();
  } catch (error) {
    if (error?.message) ElMessage.error(error.message);
  }
}

async function linkOrder(row) {
  try {
    const { value } = await ElMessageBox.prompt(t('orderNumber'), t('linkOrder'), {
      inputValue: row.order_id ?? '', inputPlaceholder: 'Order ID',
    });
    const orderId = Number(value);
    if (!orderId) return;
    await post(`/pv/api/workbench/surveys/${row.id}/link-order`, { order_id: orderId });
    ElMessage.success(t('operationSuccess'));
    await reload();
  } catch (error) {
    if (error?.message) ElMessage.error(error.message);
  }
}

onMounted(load);
</script>
