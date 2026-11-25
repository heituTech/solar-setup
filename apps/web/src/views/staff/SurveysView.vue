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
      <div class="filter-row">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
        <el-select v-model="filters.status" clearable :placeholder="t('status')" style="width:150px">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="s in statusOptions" :key="s" :label="statusLabel(s)" :value="s" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="surveys" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="130" />
        <el-table-column :label="t('quoteNumber')" width="180">
          <template #default="{ row }">{{ row.quote_no || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('scenarios')" width="150">
          <template #default="{ row }">{{ row.scenario_no || '-' }}</template>
        </el-table-column>
        <el-table-column prop="address" :label="t('address')" min-width="150" />
        <el-table-column :label="t('engineer')" width="120">
          <template #default="{ row }">{{ row.engineer_name || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('departureAt')" width="160">
          <template #default="{ row }">{{ row.departure_at ? dt(row.departure_at) : '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('finishAt')" width="160">
          <template #default="{ row }">{{ row.finish_at ? dt(row.finish_at) : '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('constructionCost')" width="140">
          <template #default="{ row }">
            <span v-if="row.construction_cost !== null">{{ row.construction_cost }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('status')" width="150">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="320">
          <template #default="{ row }">
            <el-button v-if="canEdit && ['draft','invalid'].includes(row.status)" link type="primary" :disabled="saving" @click="submitSurvey(row)">{{ t('submitReview') }}</el-button>
            <template v-if="canReview && row.status === 'submitted'">
              <el-button link type="success" :disabled="saving" @click="review(row, 'valid', 'review')">{{ t('approve') }}</el-button>
              <el-button link type="danger" :disabled="saving" @click="review(row, 'invalid', 'review')">{{ t('reject') }}</el-button>
            </template>
            <el-button v-if="canAssign && ['submitted','reviewed','invalid'].includes(row.status)" link @click="openAssign(row)">{{ t('assignEngineer') }}</el-button>
            <el-button v-if="canFillCost(row)" link type="primary" :disabled="saving" @click="fillCost(row)">{{ t('fillConstructionCost') }}</el-button>
            <el-button
              v-if="canRequestCompletion(row)"
              link
              type="success"
              :disabled="saving || row.construction_cost === null"
              @click="requestCompletion(row)"
            >{{ t('requestCompletion') }}</el-button>
            <template v-if="canReview && row.status === 'completion_pending'">
              <el-button link type="success" :disabled="saving" @click="review(row, 'valid', 'completion')">{{ t('approveCompletion') }}</el-button>
              <el-button link type="danger" :disabled="saving" @click="review(row, 'invalid', 'completion')">{{ t('reject') }}</el-button>
            </template>
            <el-button v-if="canEdit && row.status === 'completed'" link type="warning" :disabled="saving" @click="openResurvey(row)">{{ t('resurvey') }}</el-button>
            <el-button v-if="canEdit && ['draft','invalid'].includes(row.status)" link type="danger" :disabled="saving" @click="remove(row)">{{ t('delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPage" />
    </div>

    <el-dialog v-model="dialog" :title="t('newSurvey')" width="640px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item class="span-2" :label="t('selectCustomer')">
            <el-select v-model="form.customer_id" filterable style="width: 100%" @change="onCustomerChange">
              <el-option v-for="item in customers" :key="item.id" :value="item.id" :label="`${item.name} · ${item.phone || ''}`" />
            </el-select>
          </el-form-item>
          <el-form-item class="span-2" :label="t('selectQuote')" required>
            <el-select
              v-model="form.quote_id"
              :disabled="!form.customer_id || !quotes.length"
              :placeholder="t('selectQuote')"
              style="width: 100%"
            >
              <el-option v-for="item in quotes" :key="item.id" :value="item.id" :label="`${item.quote_no} · ${item.scenario_no || '-'}`" />
            </el-select>
            <div v-if="form.customer_id && !quotes.length" class="muted">{{ t('noQuoteHint') }}</div>
            <div v-else-if="selectedQuote" class="muted">{{ t('scenarios') }}: {{ selectedQuote.scenario_no || '-' }}</div>
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
          <el-form-item :label="t('departureAt')" required>
            <el-date-picker v-model="form.departure_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('finishAt')" required>
            <el-date-picker v-model="form.finish_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="assignDialog" :title="t('assignEngineer')" width="460px">
      <el-form label-position="top">
        <el-form-item :label="t('engineer')">
          <el-select v-model="assignForm.engineer_id" style="width: 100%" :placeholder="t('engineer')">
            <el-option v-for="item in engineers" :key="item.id" :value="item.id" :label="`${item.name} · ${roleLabel(item.role)}`" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveAssign">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resurveyDialog" :title="t('resurvey')" width="460px">
      <el-form label-position="top">
        <el-form-item :label="t('departureAt')" required>
          <el-date-picker v-model="resurveyForm.departure_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('finishAt')" required>
          <el-date-picker v-model="resurveyForm.finish_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resurveyDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveResurvey">{{ t('save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post, del } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const surveys = ref([]);
const customers = ref([]);
const quotes = ref([]);
const directory = ref([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '' });
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const assignDialog = ref(false);
const resurveyDialog = ref(false);
const statusOptions = ['draft', 'submitted', 'reviewed', 'completion_pending', 'completed', 'invalid'];
const form = reactive({
  customer_id: null, quote_id: null, address: '', roof_type: 'rooftop', roof_area: null,
  monthly_consumption: null, note: '', departure_at: '', finish_at: '',
});
const assignForm = reactive({ surveyId: null, engineer_id: null });
const resurveyForm = reactive({ surveyId: null, departure_at: '', finish_at: '' });

const canEdit = computed(() => ['super_admin', 'sales_manager', 'salesperson'].includes(auth.role));
const canReview = computed(() => ['super_admin', 'sales_manager'].includes(auth.role));
const canAssign = computed(() => ['super_admin', 'engineering_manager'].includes(auth.role));
const engineers = computed(() => directory.value.filter((item) => ['electrical_engineer', 'structural_engineer'].includes(item.role)));
const selectedQuote = computed(() => quotes.value.find((item) => item.id === form.quote_id) || null);

function roleLabel(role) {
  const key = `role_${role}`;
  const label = t(key);
  return label === key ? role : label;
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: '10' });
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.status) params.set('status', filters.status);
    const requests = [
      get(`/pv/api/workbench/surveys?${params.toString()}`),
      get('/pv/api/workbench/directory'),
    ];
    if (canEdit.value) requests.push(get('/pv/api/workbench/customers?page=1&page_size=100'));
    const [surveyData, directoryData, customerData] = await Promise.all(requests);
    surveys.value = surveyData.surveys || [];
    total.value = surveyData.total || 0;
    directory.value = directoryData.users || [];
    if (customerData) customers.value = customerData.customers || [];
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
    customer_id: null, quote_id: null, address: '', roof_type: 'rooftop', roof_area: null,
    monthly_consumption: null, note: '', departure_at: '', finish_at: '',
  });
  quotes.value = [];
  dialog.value = true;
}

// 选择客户后加载该客户的报价，勘测必须关联报价
async function onCustomerChange(customerId) {
  form.quote_id = null;
  quotes.value = [];
  if (!customerId) return;
  await loadQuotes(customerId);
  if (quotes.value.length === 1) form.quote_id = quotes.value[0].id;
}

async function loadQuotes(customerId) {
  try {
    const data = await get(`/pv/api/workbench/quotes?customer_id=${customerId}&page=1&page_size=100`);
    quotes.value = data.quotes || [];
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function save() {
  if (!form.customer_id) return ElMessage.warning(t('selectCustomer'));
  if (!form.quote_id) return ElMessage.warning(t('selectQuote'));
  if (!form.departure_at || !form.finish_at) return ElMessage.warning(t('surveyTimeRequired'));
  saving.value = true;
  try {
    await post('/pv/api/workbench/surveys', {
      quote_id: form.quote_id,
      address: form.address,
      roof_type: form.roof_type,
      roof_area: form.roof_area,
      monthly_consumption: form.monthly_consumption,
      departure_at: form.departure_at,
      finish_at: form.finish_at,
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

// stage=review 表示踏勘申请审核；stage=completion 表示完成踏勘审核
async function review(row, decision, stage) {
  saving.value = true;
  try {
    const { value } = await ElMessageBox.prompt(t('notes'), stage === 'completion' ? t('approveCompletion') : t('review'), {
      inputValue: '', inputPlaceholder: t('optional'),
    });
    await post(`/pv/api/workbench/surveys/${row.id}/review`, { decision, note: value || null });
    ElMessage.success(t('operationSuccess'));
    await reload();
  } catch (error) {
    if (error?.message) ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

function openAssign(row) {
  Object.assign(assignForm, { surveyId: row.id, engineer_id: row.engineer_id || null });
  assignDialog.value = true;
}

async function saveAssign() {
  if (!assignForm.engineer_id) return ElMessage.warning(t('engineer'));
  const engineer = directory.value.find((item) => item.id === Number(assignForm.engineer_id));
  saving.value = true;
  try {
    await post(`/pv/api/workbench/surveys/${assignForm.surveyId}/assign-engineer`, {
      engineer_id: assignForm.engineer_id,
      engineer_name: engineer?.name || null,
    });
    ElMessage.success(t('operationSuccess'));
    assignDialog.value = false;
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

// 施工费用只能由被指定的踏勘工程师本人填写（超管可代填）
function canFillCost(row) {
  if (row.status !== 'reviewed') return false;
  if (auth.role === 'super_admin') return true;
  return Boolean(row.engineer_id) && Number(row.engineer_id) === Number(auth.user?.id);
}

function canRequestCompletion(row) {
  return canFillCost(row);
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

async function requestCompletion(row) {
  saving.value = true;
  try {
    await ElMessageBox.confirm(t('requestCompletionConfirm'), t('requestCompletion'), {
      type: 'warning', confirmButtonText: t('confirm'), cancelButtonText: t('cancel'),
    });
    await post(`/pv/api/workbench/surveys/${row.id}/request-completion`, {});
    ElMessage.success(t('operationSuccess'));
    await reload();
  } catch (error) {
    if (error?.message && error.message !== 'cancel') ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

function openResurvey(row) {
  Object.assign(resurveyForm, { surveyId: row.id, departure_at: '', finish_at: '' });
  resurveyDialog.value = true;
}

async function saveResurvey() {
  if (!resurveyForm.departure_at || !resurveyForm.finish_at) return ElMessage.warning(t('surveyTimeRequired'));
  saving.value = true;
  try {
    await post(`/pv/api/workbench/surveys/${resurveyForm.surveyId}/resurvey`, {
      departure_at: resurveyForm.departure_at,
      finish_at: resurveyForm.finish_at,
    });
    ElMessage.success(t('operationSuccess'));
    resurveyDialog.value = false;
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(t('confirmDelete'), t('delete'), { type: 'warning', confirmButtonText: t('delete'), cancelButtonText: t('cancel') });
  } catch {
    return;
  }
  saving.value = true;
  try {
    await del(`/pv/api/workbench/surveys/${row.id}`);
    ElMessage.success(t('operationSuccess'));
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
