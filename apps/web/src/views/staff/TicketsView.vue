<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('tickets') }}</h3>
      <div class="toolbar-actions">
        <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
        <el-button type="primary" :disabled="loading" @click="openCreate">{{ t('createTicket') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <div class="filter-row">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
        <el-select v-model="filters.status" clearable :placeholder="t('status')" style="width:160px">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="s in statusOptions" :key="s" :label="statusLabel(s)" :value="s" />
        </el-select>
        <el-select v-model="filters.priority" clearable :placeholder="t('priority')" style="width:160px">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="p in priorityOptions" :key="p" :label="statusLabel(p)" :value="p" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="tickets" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="title" :label="t('title')" min-width="150" />
        <el-table-column prop="order_no" :label="t('orderNumber')" width="180" />
        <el-table-column prop="customer_name" :label="t('customerName')" width="130" />
        <el-table-column :label="t('priority')" width="100">
          <template #default="{ row }">{{ statusLabel(row.priority) }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="130">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="created_by_name" :label="t('createdBy')" width="120" />
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="300">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="loading" @click="openDetail(row)">{{ t('viewDetail') }}</el-button>
            <el-button v-if="canHandle && row.status === 'open'" link type="primary" :disabled="saving" @click="setStatus(row, 'in_progress')">{{ t('progress') }}</el-button>
            <el-button v-if="canHandle && ['open', 'in_progress'].includes(row.status)" link type="success" :disabled="saving" @click="openUpdate(row)">{{ t('resolve') }}</el-button>
            <el-button v-if="canHandle && row.status === 'resolved'" link :disabled="saving" @click="setStatus(row, 'closed')">{{ t('markClosed') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPage" />
    </div>

    <el-dialog v-model="createDialog" :title="t('createTicket')" width="520px">
      <el-form :model="form" label-position="top">
        <el-form-item :label="t('selectOrder')" required>
          <el-select v-model="form.order_id" filterable style="width: 100%" @change="onOrderChange">
            <el-option v-for="item in orders" :key="item.id" :value="item.id" :label="`${item.order_no} · ${item.customer_name}`" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('title')"><el-input v-model="form.title" /></el-form-item>
        <el-form-item :label="t('description')"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item :label="t('priority')">
          <el-select v-model="form.priority" style="width: 100%">
            <el-option :label="statusLabel('low')" value="low" />
            <el-option :label="statusLabel('normal')" value="normal" />
            <el-option :label="statusLabel('high')" value="high" />
            <el-option :label="statusLabel('urgent')" value="urgent" />
          </el-select>
        </el-form-item>
        <div class="muted">{{ t('defaultStakeholdersHint') }}</div>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="create">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="updateDialog" :title="t('resolve')" width="480px">
      <el-form label-position="top">
        <el-form-item :label="t('resolution')">
          <el-input v-model="resolution" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="updateDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="resolve">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailDrawer" :title="t('ticketDetail')" size="560px">
      <template v-if="detail.ticket">
        <div class="detail-grid">
          <div class="detail-item span-2"><span>{{ t('title') }}</span>{{ detail.ticket.title }}</div>
          <div class="detail-item"><span>{{ t('orderNumber') }}</span>{{ detail.ticket.order_no || '-' }}</div>
          <div class="detail-item"><span>{{ t('customerName') }}</span>{{ detail.ticket.customer_name || '-' }}</div>
          <div class="detail-item"><span>{{ t('createdBy') }}</span>{{ detail.ticket.created_by_name || '-' }}</div>
          <div class="detail-item"><span>{{ t('date') }}</span>{{ dt(detail.ticket.created_at) }}</div>
          <div class="detail-item"><span>{{ t('priority') }}</span>{{ statusLabel(detail.ticket.priority) }}</div>
          <div class="detail-item"><span>{{ t('status') }}</span>{{ statusLabel(detail.ticket.status) }}</div>
          <div class="detail-item span-2"><span>{{ t('description') }}</span>{{ detail.ticket.description || '-' }}</div>
          <div v-if="detail.ticket.resolution" class="detail-item span-2"><span>{{ t('resolution') }}</span>{{ detail.ticket.resolution }}</div>
        </div>

        <div class="section-gap">
          <div class="panel-title">
            <h3>{{ t('stakeholders') }}</h3>
            <el-button v-if="canEditStakeholders" link type="primary" :loading="saving" @click="saveStakeholders">{{ t('save') }}</el-button>
          </div>
          <template v-if="canEditStakeholders">
            <el-select v-model="stakeholderIds" multiple filterable style="width: 100%" :placeholder="t('editStakeholders')">
              <el-option v-for="item in directory" :key="item.id" :value="item.id" :label="item.name" />
            </el-select>
          </template>
          <el-table :data="detail.stakeholders" size="small" :empty-text="t('noData')">
            <el-table-column prop="user_name" :label="t('name')" min-width="140" />
            <el-table-column :label="t('role')" width="140">
              <template #default="{ row }">{{ t('role_' + row.role) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get, post, patch } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const tickets = ref([]);
const orders = ref([]);
const directory = ref([]);
const loading = ref(false);
const saving = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '', priority: '' });
const statusOptions = ['open', 'in_progress', 'resolved', 'closed'];
const priorityOptions = ['low', 'normal', 'high', 'urgent'];
const createDialog = ref(false);
const updateDialog = ref(false);
const resolution = ref('');
const editing = ref(null);
const detailDrawer = ref(false);
const detail = ref({ ticket: null, stakeholders: [] });
const stakeholderIds = ref([]);
const form = reactive({ order_id: null, order_no: '', customer_id: null, customer_name: '', title: '', description: '', priority: 'normal' });
const canHandle = computed(() => ['super_admin', 'after_sales', 'after_sales_manager', 'electrical_engineer', 'structural_engineer'].includes(auth.role));
const canEditStakeholders = computed(() => ['super_admin', 'after_sales_manager'].includes(auth.role));

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: String(pageSize.value) });
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    const [ticketData, orderData] = await Promise.all([
      get(`/pv/api/workbench/tickets?${params.toString()}`),
      get('/pv/api/workbench/orders?page_size=100'),
    ]);
    tickets.value = ticketData.tickets || [];
    total.value = ticketData.total || 0;
    orders.value = orderData.orders || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function loadDirectory() {
  try {
    const data = await get('/pv/api/workbench/directory');
    directory.value = data.users || [];
  } catch (error) {
    directory.value = [];
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
  filters.priority = '';
  reload();
}

function onOrderChange(id) {
  const order = orders.value.find((item) => item.id === Number(id));
  form.order_no = order ? order.order_no : '';
  form.customer_id = order ? order.customer_id : null;
  form.customer_name = order ? order.customer_name : '';
}

function openCreate() {
  Object.assign(form, {
    order_id: null, order_no: '', customer_id: null, customer_name: '', title: '', description: '', priority: 'normal',
  });
  createDialog.value = true;
}

async function create() {
  if (!form.order_id) return ElMessage.warning(t('orderRequired'));
  if (!form.title) return ElMessage.warning(t('title'));
  saving.value = true;
  try {
    await post('/pv/api/workbench/tickets', form);
    ElMessage.success(t('operationSuccess'));
    createDialog.value = false;
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function openDetail(row) {
  try {
    detail.value = await get(`/pv/api/workbench/tickets/${row.id}`);
    stakeholderIds.value = (detail.value.stakeholders || []).map((item) => item.user_id);
    detailDrawer.value = true;
    if (canEditStakeholders.value) loadDirectory();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function saveStakeholders() {
  saving.value = true;
  try {
    const stakeholders = stakeholderIds.value.map((id) => {
      const user = directory.value.find((item) => item.id === Number(id));
      return { user_id: id, user_name: user ? user.name : null, role: user ? user.role : null };
    });
    const data = await patch(`/pv/api/workbench/tickets/${detail.value.ticket.id}/stakeholders`, { stakeholders });
    detail.value.stakeholders = data.stakeholders || [];
    ElMessage.success(t('operationSuccess'));
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

function openUpdate(row) {
  editing.value = row;
  resolution.value = row.resolution || '';
  updateDialog.value = true;
}

async function resolve() {
  saving.value = true;
  try {
    await patch(`/pv/api/workbench/tickets/${editing.value.id}`, { status: 'resolved', resolution: resolution.value });
    updateDialog.value = false;
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function setStatus(row, status) {
  saving.value = true;
  try {
    await patch(`/pv/api/workbench/tickets/${row.id}`, { status });
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
@media (max-width: 768px) {
  .detail-grid { grid-template-columns: 1fr; }
  .panel-title { flex-wrap: wrap; gap: 8px; }
}
</style>
