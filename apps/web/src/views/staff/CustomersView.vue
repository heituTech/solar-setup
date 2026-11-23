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
      <div class="filter-bar">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable class="filter-item" @keyup.enter="reload" />
        <el-input v-model="filters.owner_id" :placeholder="t('ownerId')" clearable class="filter-item" @keyup.enter="reload" />
        <el-input v-model="filters.owner_name" :placeholder="t('ownerName')" clearable class="filter-item" @keyup.enter="reload" />
        <el-date-picker
          v-model="filters.dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          :start-placeholder="t('startDate')"
          :end-placeholder="t('endDate')"
          clearable
          class="filter-item filter-date"
        />
        <el-select v-model="filters.status" clearable :placeholder="t('status')" class="filter-item">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="s in ['lead','qualified','won','lost']" :key="s" :label="statusLabel(s)" :value="s" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="customers" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="name" :label="t('name')" min-width="140" />
        <el-table-column prop="phone" :label="t('phone')" width="140" />
        <el-table-column :label="t('region')" width="150">
          <template #default="{ row }">{{ regionLabel(row.region) }}</template>
        </el-table-column>
        <el-table-column prop="owner_name" :label="t('owner')" width="120" />
        <el-table-column :label="t('createdBy')" width="130">
          <template #default="{ row }">{{ row.created_by_name || '-' }}</template>
        </el-table-column>
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
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPage" />
    </div>

    <el-dialog v-model="dialog" :title="form.id ? t('edit') : t('newCustomer')" width="640px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item :label="t('name')"><el-input v-model="form.name" /></el-form-item>
          <el-form-item :label="t('phone')"><el-input v-model="form.phone" /></el-form-item>
          <el-form-item :label="t('email')"><el-input v-model="form.email" /></el-form-item>
          <el-form-item :label="t('region')">
            <el-select v-model="form.region" filterable clearable style="width: 100%">
              <el-option v-for="item in regionOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item class="span-2" :label="t('address')"><el-input v-model="form.address" /></el-form-item>
          <el-form-item :label="t('owner')">
            <el-select v-if="canChangeOwner" v-model="form.owner_id" filterable style="width: 100%" @change="onOwnerChange">
              <el-option v-for="item in ownerOptions" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-input v-else :model-value="form.owner_name || auth.user?.name" disabled />
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
        <div class="detail-item"><span>{{ t('region') }}</span>{{ regionLabel(detail.customer.region) }}</div>
        <div class="detail-item"><span>{{ t('owner') }}</span>{{ detail.customer.owner_name || '-' }}</div>
        <div class="detail-item"><span>{{ t('createdBy') }}</span>{{ detail.customer.created_by_name || '-' }}</div>
        <div class="detail-item"><span>{{ t('date') }}</span>{{ dt(detail.customer.created_at) }}</div>
        <div class="detail-item"><span>{{ t('status') }}</span>{{ statusLabel(detail.customer.status) }}</div>
        <div class="detail-item span-2"><span>{{ t('address') }}</span>{{ detail.customer.address || '-' }}</div>
      </div>

      <div class="section-gap" v-if="detail.owner_logs && detail.owner_logs.length">
        <div class="panel-title"><h3>{{ t('ownerHistory') }}</h3></div>
        <el-table :data="detail.owner_logs" size="small" :empty-text="t('noData')">
          <el-table-column :label="t('oldOwner')" min-width="110">
            <template #default="{ row }">{{ row.old_owner_name || '-' }}</template>
          </el-table-column>
          <el-table-column :label="t('newOwner')" min-width="110">
            <template #default="{ row }">{{ row.new_owner_name || '-' }}</template>
          </el-table-column>
          <el-table-column :label="t('changedBy')" width="110">
            <template #default="{ row }">{{ row.changed_by_name || '-' }}</template>
          </el-table-column>
          <el-table-column :label="t('changedAt')" width="150">
            <template #default="{ row }">{{ dt(row.created_at) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="section-gap" v-if="detail.customer">
        <ScenarioPanel :customer-id="detail.customer.id" @order-created="onOrderCreated" />
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
import ScenarioPanel from './ScenarioPanel.vue';

const KH_PROVINCES = [
  { value: 'banteay_meanchey', zh: '班迭棉吉', en: 'Banteay Meanchey', km: 'បន្ទាយមានជ័យ' },
  { value: 'battambang', zh: '马德望', en: 'Battambang', km: 'បាត់ដំបង' },
  { value: 'kampong_cham', zh: '磅湛', en: 'Kampong Cham', km: 'កំពង់ចាម' },
  { value: 'kampong_chhnang', zh: '磅清扬', en: 'Kampong Chhnang', km: 'កំពង់ឆ្នាំង' },
  { value: 'kampong_speu', zh: '磅士卑', en: 'Kampong Speu', km: 'កំពង់ស្ពឺ' },
  { value: 'kampong_thom', zh: '磅同', en: 'Kampong Thom', km: 'កំពង់ធំ' },
  { value: 'kampot_kep', zh: '贡布 / 白马', en: 'Kampot / Kep', km: 'កំពត / កែប' },
  { value: 'kandal', zh: '干丹', en: 'Kandal', km: 'កណ្តាល' },
  { value: 'koh_kong', zh: '国公', en: 'Koh Kong', km: 'កោះកុង' },
  { value: 'kratie', zh: '桔井', en: 'Kratie', km: 'ក្រចេះ' },
  { value: 'mondulkiri', zh: '蒙多基里', en: 'Mondulkiri', km: 'មណ្ឌលគិរី' },
  { value: 'oddar_meanchey', zh: '奥多棉吉', en: 'Oddar Meanchey', km: 'ឧត្តរមានជ័យ' },
  { value: 'pailin', zh: '拜林', en: 'Pailin', km: 'ប៉ៃលិន' },
  { value: 'phnom_penh', zh: '金边', en: 'Phnom Penh', km: 'ភ្នំពេញ' },
  { value: 'preah_sihanouk', zh: '西哈努克', en: 'Preah Sihanouk', km: 'ព្រះសីហនុ' },
  { value: 'preah_vihear', zh: '柏威夏', en: 'Preah Vihear', km: 'ព្រះវិហារ' },
  { value: 'pursat', zh: '菩萨', en: 'Pursat', km: 'ពោធិ៍សាត់' },
  { value: 'prey_veng', zh: '波萝勉', en: 'Prey Veng', km: 'ព្រៃវែង' },
  { value: 'ratanakiri', zh: '拉达那基里', en: 'Ratanakiri', km: 'រតនគិរី' },
  { value: 'siem_reap', zh: '暹粒', en: 'Siem Reap', km: 'សៀមរាប' },
  { value: 'stung_treng', zh: '上丁', en: 'Stung Treng', km: 'ស្ទឹងត្រែង' },
  { value: 'svay_rieng', zh: '柴桢', en: 'Svay Rieng', km: 'ស្វាយរៀង' },
  { value: 'takeo', zh: '茶胶', en: 'Takeo', km: 'តាកែវ' },
  { value: 'tboung_khmum', zh: '特本克蒙', en: 'Tboung Khmum', km: 'ត្បូងឃ្មុំ' },
];

const { t, locale } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const customers = ref([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '', owner_id: '', owner_name: '', dateRange: null });
const loading = ref(false);
const dialog = ref(false);
const drawer = ref(false);
const saving = ref(false);
const detail = ref({});
const directory = ref([]);
const form = reactive({
  id: null, name: '', phone: '', email: '', region: '', address: '', status: 'lead', note: '', owner_id: null, owner_name: '',
});

const canEdit = computed(() => ['super_admin', 'sales_manager', 'salesperson'].includes(auth.role));
const canChangeOwner = computed(() => ['super_admin', 'sales_manager'].includes(auth.role));
const regionOptions = computed(() => KH_PROVINCES.map((item) => ({
  value: item.value,
  label: locale.value === 'zh' ? item.zh : locale.value === 'km' ? item.km : item.en,
})));
const ownerOptions = computed(() => directory.value.filter((item) => ['salesperson', 'sales_manager'].includes(item.role)));

function regionLabel(value) {
  if (!value) return '-';
  const found = KH_PROVINCES.find((item) => item.value === value);
  if (!found) return value;
  return locale.value === 'zh' ? found.zh : locale.value === 'km' ? found.km : found.en;
}

async function loadDirectory() {
  if (!canChangeOwner.value) return;
  try {
    const data = await get('/pv/api/workbench/directory');
    directory.value = data.users || [];
  } catch (error) {
    directory.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: '10' });
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.status) params.set('status', filters.status);
    if (filters.owner_id.trim()) params.set('owner_id', filters.owner_id.trim());
    if (filters.owner_name.trim()) params.set('owner_name', filters.owner_name.trim());
    if (Array.isArray(filters.dateRange) && filters.dateRange.length === 2) {
      params.set('created_from', filters.dateRange[0]);
      params.set('created_to', filters.dateRange[1]);
    }
    const data = await get(`/pv/api/workbench/customers?${params.toString()}`);
    customers.value = data.customers || [];
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
  load();
}

function resetFilters() {
  filters.q = '';
  filters.status = '';
  filters.owner_id = '';
  filters.owner_name = '';
  filters.dateRange = null;
  reload();
}

function resetForm() {
  Object.assign(form, {
    id: null, name: '', phone: '', email: '', region: '', address: '', status: 'lead', note: '',
    owner_id: auth.user?.id || null, owner_name: auth.user?.name || '',
  });
}

function openCreate() {
  resetForm();
  dialog.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id, name: row.name, phone: row.phone || '', email: row.email || '', region: row.region || '',
    address: row.address || '', status: row.status || 'lead', note: row.note || '',
    owner_id: row.owner_id || null, owner_name: row.owner_name || '',
  });
  dialog.value = true;
}

function onOwnerChange(id) {
  const found = ownerOptions.value.find((item) => item.id === Number(id));
  form.owner_name = found ? found.name : '';
}

async function save() {
  if (!form.name) return ElMessage.warning(t('name'));
  if (!form.phone && !form.email) return ElMessage.warning(t('phone') + ' / ' + t('email'));
  saving.value = true;
  try {
    const payload = {
      name: form.name, phone: form.phone, email: form.email, region: form.region,
      address: form.address, status: form.status, note: form.note,
    };
    if (canChangeOwner.value) {
      payload.owner_id = form.owner_id;
      payload.owner_name = form.owner_name;
    }
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

async function onOrderCreated() {
  // 订单创建后刷新详情
  if (detail.value.customer) {
    detail.value = await get(`/pv/api/workbench/customers/${detail.value.customer.id}`);
  }
}

onMounted(() => {
  load();
  loadDirectory();
});
</script>
