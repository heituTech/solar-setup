<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('projects') }}</h3>
      <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
    </div>

    <div class="panel">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
        <el-select v-model="filters.status" clearable :placeholder="t('status')" style="width:160px">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="s in statusOptions" :key="s" :label="statusLabel(s)" :value="s" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="projects" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="order_no" :label="t('orderNumber')" width="190" />
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="130" />
        <el-table-column prop="address" :label="t('address')" min-width="150" />
        <el-table-column prop="electrical_engineer_name" :label="t('electricalEngineer')" width="140" />
        <el-table-column prop="structural_engineer_name" :label="t('structuralEngineer')" width="140" />
        <el-table-column :label="t('status')" width="160">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="120">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="loading" @click="openDetail(row)">{{ t('viewDetail') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="(p) => { page.value = p; load(); }" />
    </div>

    <el-drawer v-model="drawer" :title="t('projects')" size="680px">
      <template v-if="detail.project">
        <div class="detail-grid">
          <div class="detail-item"><span>{{ t('orderNumber') }}</span>{{ detail.project.order_no }}</div>
          <div class="detail-item"><span>{{ t('customerName') }}</span>{{ detail.project.customer_name }}</div>
          <div class="detail-item span-2"><span>{{ t('address') }}</span>{{ detail.project.address || '-' }}</div>
          <div class="detail-item"><span>{{ t('status') }}</span>{{ statusLabel(detail.project.status) }}</div>
          <div class="detail-item"><span>{{ t('acceptedAt') }}</span>{{ dt(detail.project.accepted_at) }}</div>
          <div class="detail-item"><span>{{ t('electricalEngineer') }}</span>{{ detail.project.electrical_engineer_name || '-' }}</div>
          <div class="detail-item"><span>{{ t('structuralEngineer') }}</span>{{ detail.project.structural_engineer_name || '-' }}</div>
        </div>

        <div v-if="canAssign && detail.project.status !== 'accepted'" class="panel section-gap">
          <div class="panel-title"><h3>{{ t('assign') }}</h3></div>
          <div class="form-grid">
            <el-form-item :label="t('electricalEngineer')">
              <el-select v-model="assignForm.electrical_engineer_id" filterable clearable style="width: 100%">
                <el-option v-for="item in engineers.electrical" :key="item.id" :value="item.id" :label="item.name" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('structuralEngineer')">
              <el-select v-model="assignForm.structural_engineer_id" filterable clearable style="width: 100%">
                <el-option v-for="item in engineers.structural" :key="item.id" :value="item.id" :label="item.name" />
              </el-select>
            </el-form-item>
          </div>
          <el-button type="primary" :loading="saving" @click="assign">{{ t('save') }}</el-button>
        </div>

        <div v-if="canProgress && detail.project.status !== 'accepted'" class="panel section-gap">
          <div class="panel-title"><h3>{{ t('progress') }}</h3></div>
          <div class="form-grid">
            <el-form-item :label="t('stage')">
              <el-select v-model="progressForm.stage" style="width: 100%">
                <el-option :label="t('start')" value="start" />
                <el-option :label="statusLabel('material_delivered')" value="material_delivered" />
                <el-option :label="statusLabel('installed')" value="installed" />
                <el-option :label="statusLabel('testing')" value="testing" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('notes')"><el-input v-model="progressForm.note" /></el-form-item>
          </div>
          <el-button :loading="saving" @click="addProgress">{{ t('save') }}</el-button>
          <el-button v-if="canAccept && detail.project.status === 'in_delivery'" type="success" :loading="saving" @click="accept">{{ t('finalAcceptance') }}</el-button>
        </div>

        <div class="panel section-gap">
          <div class="panel-title"><h3>{{ t('devices') }}</h3></div>
          <el-table :data="detail.devices" size="small" :empty-text="t('noData')">
            <el-table-column prop="name" :label="t('name')" min-width="120" />
            <el-table-column prop="model" :label="t('product')" width="120" />
            <el-table-column prop="serial_no" :label="t('serialNumber')" width="130" />
            <el-table-column prop="quantity" :label="t('quantity')" width="80" />
            <el-table-column :label="t('status')" width="140">
              <template #default="{ row }">
                <el-select v-model="row.status" size="small" :disabled="!canDevice" @change="updateDevice(row)">
                  <el-option :label="statusLabel('pending')" value="pending" />
                  <el-option :label="statusLabel('in_stock')" value="in_stock" />
                  <el-option :label="statusLabel('delivered')" value="delivered" />
                  <el-option :label="statusLabel('installed')" value="installed" />
                  <el-option :label="statusLabel('accepted')" value="accepted" />
                </el-select>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="canDevice" class="form-grid section-gap">
            <el-form-item :label="t('category')"><el-input v-model="deviceForm.category" /></el-form-item>
            <el-form-item :label="t('product')"><el-input v-model="deviceForm.model" /></el-form-item>
            <el-form-item :label="t('name')"><el-input v-model="deviceForm.name" /></el-form-item>
            <el-form-item :label="t('serialNumber')"><el-input v-model="deviceForm.serial_no" /></el-form-item>
            <el-form-item :label="t('quantity')"><el-input-number v-model="deviceForm.quantity" :min="1" style="width: 100%" /></el-form-item>
            <el-form-item><el-button type="primary" :loading="saving" @click="addDevice">{{ t('addDevice') }}</el-button></el-form-item>
          </div>
        </div>

        <div class="panel section-gap">
          <div class="panel-title"><h3>{{ t('timeline') }}</h3></div>
          <el-timeline>
            <el-timeline-item v-for="item in detail.progress" :key="item.id" :timestamp="dt(item.created_at)">
              {{ statusLabel(item.stage) }} · {{ item.actor_name || '-' }} {{ item.note ? `· ${item.note}` : '' }}
            </el-timeline-item>
          </el-timeline>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post, patch } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const projects = ref([]);
const directory = ref([]);
const loading = ref(false);
const saving = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '', priority: '' });
const statusOptions = ['pending_assignment', 'initializing', 'in_delivery', 'accepted'];
const drawer = ref(false);
const detail = ref({ project: null, devices: [], progress: [], tickets: [] });
const assignForm = reactive({ electrical_engineer_id: null, structural_engineer_id: null });
const progressForm = reactive({ stage: 'start', note: '' });
const deviceForm = reactive({ category: 'inverter', model: '', name: '', serial_no: '', quantity: 1 });

const canAssign = computed(() => ['super_admin', 'sales_manager'].includes(auth.role));
const canProgress = computed(() => ['super_admin', 'electrical_engineer', 'structural_engineer', 'warehouse', 'after_sales'].includes(auth.role));
const canAccept = computed(() => ['super_admin', 'electrical_engineer', 'structural_engineer'].includes(auth.role));
const canDevice = computed(() => canProgress.value);

const engineers = computed(() => ({
  electrical: directory.value.filter((item) => item.role === 'electrical_engineer'),
  structural: directory.value.filter((item) => item.role === 'structural_engineer'),
}));

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: String(pageSize.value) });
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    const [projectData, dirData] = await Promise.all([
      get(`/pv/api/workbench/projects?${params.toString()}`),
      get('/pv/api/workbench/directory'),
    ]);
    projects.value = projectData.projects || [];
    total.value = projectData.total || 0;
    directory.value = dirData.users || [];
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

async function openDetail(row) {
  try {
    detail.value = await get(`/pv/api/workbench/projects/${row.id}`);
    assignForm.electrical_engineer_id = detail.value.project.electrical_engineer_id;
    assignForm.structural_engineer_id = detail.value.project.structural_engineer_id;
    progressForm.stage = 'start';
    progressForm.note = '';
    drawer.value = true;
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function refreshDetail() {
  detail.value = await get(`/pv/api/workbench/projects/${detail.value.project.id}`);
  await reload();
}

async function assign() {
  saving.value = true;
  try {
    const nameOf = (id) => directory.value.find((item) => item.id === id)?.name || null;
    await post(`/pv/api/workbench/projects/${detail.value.project.id}/assign`, {
      electrical_engineer_id: assignForm.electrical_engineer_id,
      electrical_engineer_name: nameOf(assignForm.electrical_engineer_id),
      structural_engineer_id: assignForm.structural_engineer_id,
      structural_engineer_name: nameOf(assignForm.structural_engineer_id),
    });
    ElMessage.success(t('operationSuccess'));
    await refreshDetail();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function addProgress() {
  saving.value = true;
  try {
    await post(`/pv/api/workbench/projects/${detail.value.project.id}/progress`, {
      stage: progressForm.stage, note: progressForm.note,
    });
    progressForm.note = '';
    await refreshDetail();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function accept() {
  saving.value = true;
  try {
    await ElMessageBox.confirm(`${t('finalAcceptance')}?`, t('confirm'));
    await post(`/pv/api/workbench/projects/${detail.value.project.id}/accept`, {});
    ElMessage.success(t('operationSuccess'));
    await refreshDetail();
  } catch (error) {
    if (error?.message) ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function addDevice() {
  if (!deviceForm.model || !deviceForm.name) return ElMessage.warning(t('name'));
  saving.value = true;
  try {
    await post('/pv/api/workbench/devices', {
      project_id: detail.value.project.id, ...deviceForm,
    });
    Object.assign(deviceForm, { category: 'inverter', model: '', name: '', serial_no: '', quantity: 1 });
    await refreshDetail();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function updateDevice(device) {
  saving.value = true;
  try {
    await patch(`/pv/api/workbench/devices/${device.id}`, { status: device.status });
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
