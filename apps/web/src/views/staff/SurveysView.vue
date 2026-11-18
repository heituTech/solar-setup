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
      <el-table :data="surveys" v-loading="loading" empty-text="暂无记录">
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="130" />
        <el-table-column prop="address" :label="t('address')" min-width="160" />
        <el-table-column prop="roof_type" :label="t('roofType')" width="120" />
        <el-table-column prop="roof_area" :label="t('roofArea')" width="120" />
        <el-table-column :label="t('status')" width="120">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="220">
          <template #default="{ row }">
            <el-button v-if="canEdit && row.status === 'draft'" link type="primary" :disabled="saving" @click="submitSurvey(row)">{{ t('submitReview') }}</el-button>
            <template v-if="canReview && row.status === 'submitted'">
              <el-button link type="success" :disabled="saving" @click="review(row, 'valid')">{{ t('valid') }}</el-button>
              <el-button link type="danger" :disabled="saving" @click="review(row, 'invalid')">{{ t('invalid') }}</el-button>
            </template>
            <span v-if="row.review_note" class="muted">{{ row.review_note }}</span>
          </template>
        </el-table-column>
      </el-table>
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

const { t } = useI18n();
const auth = useAuthStore();
const surveys = ref([]);
const customers = ref([]);
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
    const [surveyData, customerData] = await Promise.all([
      get('/pv/api/workbench/surveys'),
      get('/pv/api/workbench/customers'),
    ]);
    surveys.value = surveyData.surveys || [];
    customers.value = customerData.customers || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
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
    await load();
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
    await load();
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
    await load();
  } catch (error) {
    if (error?.message) ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
