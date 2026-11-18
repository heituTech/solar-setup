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
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px">
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
        <el-table-column prop="customer_name" :label="t('customerName')" width="130" />
        <el-table-column :label="t('priority')" width="100">
          <template #default="{ row }">{{ statusLabel(row.priority) }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="130">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="220">
          <template #default="{ row }">
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
        <el-form-item :label="t('selectProject')">
          <el-select v-model="form.project_id" clearable style="width: 100%">
            <el-option v-for="item in projects" :key="item.id" :value="item.id" :label="`${item.order_no} · ${item.customer_name}`" />
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
const projects = ref([]);
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
const form = reactive({ project_id: null, title: '', description: '', priority: 'normal' });
const canHandle = computed(() => ['super_admin', 'after_sales', 'electrical_engineer', 'structural_engineer'].includes(auth.role));

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: String(pageSize.value) });
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    const [ticketData, projectData] = await Promise.all([
      get(`/pv/api/workbench/tickets?${params.toString()}`),
      get('/pv/api/workbench/projects?page_size=100'),
    ]);
    tickets.value = ticketData.tickets || [];
    total.value = ticketData.total || 0;
    projects.value = projectData.projects || [];
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
  filters.priority = '';
  reload();
}

function openCreate() {
  Object.assign(form, { project_id: null, title: '', description: '', priority: 'normal' });
  createDialog.value = true;
}

async function create() {
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
