<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('customers') }}</h3>
      <div class="toolbar-actions">
        <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
        <el-button v-if="canEdit" type="primary" :disabled="loading" @click="openCreate">{{ t('newCustomer') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
        <el-select v-model="filters.status" clearable :placeholder="t('status')" style="width:150px">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="s in ['lead','qualified','won','lost']" :key="s" :label="statusLabel(s)" :value="s" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="customers" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="name" :label="t('name')" min-width="140" />
        <el-table-column prop="phone" :label="t('phone')" width="140" />
        <el-table-column prop="region" :label="t('region')" width="130" />
        <el-table-column :label="t('source')" width="120">
          <template #default="{ row }">{{ statusLabel(row.source) }}</template>
        </el-table-column>
        <el-table-column :label="t('customerType')" width="110">
          <template #default="{ row }">{{ row.customer_type === 'engineering' ? t('engineering') : t('retail') }}</template>
        </el-table-column>
        <el-table-column prop="owner_name" :label="t('owner')" width="120" />
        <el-table-column :label="t('status')" width="110">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="180">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">{{ t('customer360') }}</el-button>
            <el-button v-if="canEdit" link @click="openEdit(row)">{{ t('edit') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="(p) => { page.value = p; load(); }" />
    </div>

    <el-dialog v-model="dialog" :title="form.id ? t('edit') : t('newCustomer')" width="640px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item :label="t('name')"><el-input v-model="form.name" /></el-form-item>
          <el-form-item :label="t('phone')"><el-input v-model="form.phone" /></el-form-item>
          <el-form-item :label="t('email')"><el-input v-model="form.email" /></el-form-item>
          <el-form-item :label="t('region')"><el-input v-model="form.region" /></el-form-item>
          <el-form-item class="span-2" :label="t('address')"><el-input v-model="form.address" /></el-form-item>
          <el-form-item :label="t('source')">
            <el-select v-model="form.source" style="width: 100%">
              <el-option :label="statusLabel('referral')" value="referral" />
              <el-option :label="statusLabel('website')" value="website" />
              <el-option :label="statusLabel('walk-in')" value="walk-in" />
              <el-option :label="statusLabel('manual')" value="manual" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('customerType')">
            <el-select v-model="form.customer_type" style="width: 100%">
              <el-option :label="t('retail')" value="retail" />
              <el-option :label="t('engineering')" value="engineering" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option :label="statusLabel('lead')" value="lead" />
              <el-option :label="statusLabel('qualified')" value="qualified" />
              <el-option :label="statusLabel('won')" value="won" />
              <el-option :label="statusLabel('lost')" value="lost" />
            </el-select>
          </el-form-item>
          <el-form-item class="span-2" :label="t('notes')">
            <el-input v-model="form.note" type="textarea" :rows="3" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="drawer" :title="t('customer360')" size="560px">
      <div v-if="detail.customer" class="detail-grid">
        <div class="detail-item span-2"><span>{{ t('name') }}</span>{{ detail.customer.name }}</div>
        <div class="detail-item"><span>{{ t('phone') }}</span>{{ detail.customer.phone || '-' }}</div>
        <div class="detail-item"><span>{{ t('email') }}</span>{{ detail.customer.email || '-' }}</div>
        <div class="detail-item"><span>{{ t('region') }}</span>{{ detail.customer.region || '-' }}</div>
        <div class="detail-item"><span>{{ t('status') }}</span>{{ statusLabel(detail.customer.status) }}</div>
        <div class="detail-item"><span>{{ t('customerType') }}</span>{{ detail.customer.customer_type === 'engineering' ? t('engineering') : t('retail') }}</div>
        <div class="detail-item span-2"><span>{{ t('address') }}</span>{{ detail.customer.address || '-' }}</div>
      </div>

      <div class="section-gap">
        <div class="panel-title"><h3>{{ t('surveys') }}</h3></div>
        <el-table :data="detail.surveys || []" size="small" :empty-text="t('noData')">
          <el-table-column :label="t('status')" width="110">
            <template #default="{ row }">{{ statusLabel(row.status) }}</template>
          </el-table-column>
          <el-table-column prop="roof_type" :label="t('roofType')" width="120" />
          <el-table-column prop="roof_area" :label="t('roofArea')" width="110" />
          <el-table-column :label="t('date')" width="140">
            <template #default="{ row }">{{ dt(row.created_at) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="section-gap">
        <div class="panel-title"><h3>{{ t('quotes') }}</h3></div>
        <el-table :data="detail.quotes || []" size="small" :empty-text="t('noData')">
          <el-table-column prop="quote_no" :label="t('quoteNumber')" width="180" />
          <el-table-column :label="t('amount')" width="120">
            <template #default="{ row }">{{ money(row.total_amount) }}</template>
          </el-table-column>
          <el-table-column :label="t('status')">
            <template #default="{ row }">{{ statusLabel(row.status) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="section-gap">
        <div class="panel-title"><h3>{{ t('orders') }}</h3></div>
        <el-table :data="detail.orders || []" size="small" :empty-text="t('noData')">
          <el-table-column prop="order_no" :label="t('orderNumber')" width="180" />
          <el-table-column :label="t('amount')" width="120">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column :label="t('outstanding')" width="110">
            <template #default="{ row }">{{ money(row.outstanding) }}</template>
          </el-table-column>
          <el-table-column :label="t('status')">
            <template #default="{ row }">{{ statusLabel(row.status) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get, post, patch } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt, money, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const customers = ref([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '' });
const loading = ref(false);
const dialog = ref(false);
const drawer = ref(false);
const saving = ref(false);
const detail = ref({});
const form = reactive({
  id: null, name: '', phone: '', email: '', region: '', address: '', source: 'manual', customer_type: 'retail', status: 'lead', note: '',
});

const canEdit = computed(() => ['super_admin', 'sales_manager', 'salesperson'].includes(auth.role));

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: '10' });
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.status) params.set('status', filters.status);
    const data = await get(`/pv/api/workbench/customers?${params.toString()}`);
    customers.value = data.customers || [];
    total.value = data.total || 0;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
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

function resetForm() {
  Object.assign(form, {
    id: null, name: '', phone: '', email: '', region: '', address: '', source: 'manual', customer_type: 'retail', status: 'lead', note: '',
  });
}

function openCreate() {
  resetForm();
  dialog.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id, name: row.name, phone: row.phone || '', email: row.email || '', region: row.region || '',
    address: row.address || '', source: row.source || 'manual', customer_type: row.customer_type || 'retail',
    status: row.status || 'lead', note: row.note || '',
  });
  dialog.value = true;
}

async function save() {
  if (!form.name) return ElMessage.warning(t('name'));
  if (!form.phone && !form.email) return ElMessage.warning(t('phone') + ' / ' + t('email'));
  saving.value = true;
  try {
    const payload = {
      name: form.name, phone: form.phone, email: form.email, region: form.region,
      address: form.address, source: form.source, customer_type: form.customer_type, status: form.status, note: form.note,
    };
    if (form.id) await patch(`/pv/api/workbench/customers/${form.id}`, payload);
    else await post('/pv/api/workbench/customers', payload);
    ElMessage.success(t('operationSuccess'));
    dialog.value = false;
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function openDetail(row) {
  try {
    detail.value = await get(`/pv/api/workbench/customers/${row.id}`);
    drawer.value = true;
  } catch (error) {
    ElMessage.error(error.message);
  }
}

onMounted(load);
</script>
