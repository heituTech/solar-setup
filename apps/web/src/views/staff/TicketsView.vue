<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('tickets') }}</h3>
      <div class="toolbar-actions">
        <el-button @click="load">{{ t('refresh') }}</el-button>
        <el-button type="primary" @click="openCreate">{{ t('createTicket') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <el-table :data="tickets" v-loading="loading" empty-text="暂无记录">
        <el-table-column prop="title" :label="t('title')" min-width="150" />
        <el-table-column prop="customer_name" :label="t('customerName')" width="130" />
        <el-table-column prop="priority" :label="t('priority')" width="100" />
        <el-table-column :label="t('status')" width="130">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="220">
          <template #default="{ row }">
            <el-button v-if="canHandle && row.status === 'open'" link type="primary" @click="setStatus(row, 'in_progress')">{{ t('progress') }}</el-button>
            <el-button v-if="canHandle && ['open', 'in_progress'].includes(row.status)" link type="success" @click="openUpdate(row)">{{ t('resolve') }}</el-button>
            <el-button v-if="canHandle && row.status === 'resolved'" link @click="setStatus(row, 'closed')">{{ t('markClosed') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
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
            <el-option label="low" value="low" />
            <el-option label="normal" value="normal" />
            <el-option label="high" value="high" />
            <el-option label="urgent" value="urgent" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="create">{{ t('save') }}</el-button>
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
        <el-button type="primary" @click="resolve">{{ t('save') }}</el-button>
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

const { t } = useI18n();
const auth = useAuthStore();
const tickets = ref([]);
const projects = ref([]);
const loading = ref(false);
const createDialog = ref(false);
const updateDialog = ref(false);
const resolution = ref('');
const editing = ref(null);
const form = reactive({ project_id: null, title: '', description: '', priority: 'normal' });
const canHandle = computed(() => ['super_admin', 'after_sales', 'electrical_engineer', 'structural_engineer'].includes(auth.role));

async function load() {
  loading.value = true;
  try {
    const [ticketData, projectData] = await Promise.all([
      get('/pv/api/workbench/tickets'),
      get('/pv/api/workbench/projects'),
    ]);
    tickets.value = ticketData.tickets || [];
    projects.value = projectData.projects || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { project_id: null, title: '', description: '', priority: 'normal' });
  createDialog.value = true;
}

async function create() {
  if (!form.title) return ElMessage.warning(t('title'));
  try {
    await post('/pv/api/workbench/tickets', form);
    ElMessage.success(t('operationSuccess'));
    createDialog.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

function openUpdate(row) {
  editing.value = row;
  resolution.value = row.resolution || '';
  updateDialog.value = true;
}

async function resolve() {
  try {
    await patch(`/pv/api/workbench/tickets/${editing.value.id}`, { status: 'resolved', resolution: resolution.value });
    updateDialog.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function setStatus(row, status) {
  try {
    await patch(`/pv/api/workbench/tickets/${row.id}`, { status });
    await load();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

onMounted(load);
</script>
