<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('orders') }}</h3>
      <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
    </div>

    <div class="panel">
      <div class="filter-row">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
        <el-select v-model="filters.status" clearable :placeholder="t('status')" style="width:150px">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="s in ['initializing','in_delivery','accepted']" :key="s" :label="statusLabel(s)" :value="s" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="orders" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="order_no" :label="t('orderNumber')" width="200" />
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="140" />
        <el-table-column prop="salesperson_name" :label="t('salesperson')" width="120">
          <template #default="{ row }">
            <span v-if="row.salesperson_name">{{ row.salesperson_name }}</span>
            <span v-else class="muted">#{{ row.salesperson_id }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="showPrices" :label="t('orderAmount')" width="130">
          <template #default="{ row }">{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column v-if="showPrices" :label="t('receivedAmount')" width="130">
          <template #default="{ row }">{{ money(row.received_amount) }}</template>
        </el-table-column>
        <el-table-column v-if="showPrices" :label="t('outstanding')" width="130">
          <template #default="{ row }">{{ money(row.outstanding) }}</template>
        </el-table-column>
        <el-table-column v-if="showPrices" :label="t('commissionRate')" width="130">
          <template #default="{ row }">{{ (Number(row.commission_rate || 0) * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="150">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="190">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="loading" @click="openDetail(row)">{{ t('viewDetail') }}</el-button>
            <el-button
              v-if="isManager && showPrices && row.status !== 'accepted'"
              link
              type="primary"
              :disabled="loading || saving"
              @click="openCommission(row)"
            >{{ t('commissionRate') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPage" />
    </div>

    <el-dialog v-model="dialog" :title="t('commissionRate')" width="420px">
      <el-form label-position="top">
        <el-form-item :label="`${t('commissionRate')} (%)`">
          <el-input-number v-model="commissionPercent" :min="0" :max="100" :step="0.1" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveCommission">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailDrawer" :title="t('orderDetail')" size="720px">
      <template v-if="detail.order">
        <div class="detail-grid">
          <div class="detail-item"><span>{{ t('orderNumber') }}</span>{{ detail.order.order_no }}</div>
          <div class="detail-item"><span>{{ t('customerName') }}</span>{{ detail.order.customer_name }}</div>
          <div class="detail-item"><span>{{ t('salesperson') }}</span>{{ detail.order.salesperson_name || `#${detail.order.salesperson_id}` }}</div>
          <div class="detail-item"><span>{{ t('status') }}</span>{{ statusLabel(detail.order.status) }}</div>
          <div v-if="showPrices" class="detail-item"><span>{{ t('orderAmount') }}</span>{{ money(detail.order.amount) }}</div>
          <div v-if="showPrices" class="detail-item"><span>{{ t('receivedAmount') }}</span>{{ money(detail.order.received_amount) }}</div>
          <div v-if="showPrices" class="detail-item"><span>{{ t('outstanding') }}</span>{{ money(detail.order.outstanding) }}</div>
          <div class="detail-item"><span>{{ t('date') }}</span>{{ dt(detail.order.created_at) }}</div>
        </div>

        <div v-if="detail.items.length" class="panel section-gap">
          <div class="panel-title"><h3>{{ t('orderItems') }}</h3></div>
          <el-table :data="detail.items" size="small" :empty-text="t('noData')">
            <el-table-column prop="name" :label="t('product')" min-width="160" />
            <el-table-column prop="qty" :label="t('quantity')" width="80" />
            <el-table-column v-if="showPrices" :label="t('unitPrice')" width="120">
              <template #default="{ row }">{{ money(row.unit_price) }}</template>
            </el-table-column>
            <el-table-column v-if="showPrices" :label="t('subtotal')" width="120">
              <template #default="{ row }">{{ money(row.subtotal) }}</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="panel section-gap">
          <div class="panel-title"><h3>{{ t('projectInfo') }}</h3></div>
          <template v-if="detail.project">
            <div class="detail-grid">
              <div class="detail-item"><span>{{ t('projectNumber') }}</span>{{ detail.project.project_no || `#${detail.project.id}` }}</div>
              <div class="detail-item"><span>{{ t('status') }}</span>{{ statusLabel(detail.project.status) }}</div>
              <div class="detail-item span-2"><span>{{ t('address') }}</span>{{ detail.project.address || '-' }}</div>
              <div class="detail-item"><span>{{ t('electricalEngineer') }}</span>{{ detail.project.electrical_engineer_name || '-' }}</div>
              <div class="detail-item"><span>{{ t('structuralEngineer') }}</span>{{ detail.project.structural_engineer_name || '-' }}</div>
              <div class="detail-item"><span>{{ t('acceptedAt') }}</span>{{ dt(detail.project.accepted_at) }}</div>
            </div>

            <div v-if="canAssign && detail.project.status !== 'accepted'" class="section-gap">
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
              <el-button type="primary" :loading="saving" @click="assign">{{ t('assign') }}</el-button>
            </div>

            <div v-if="canProgress && detail.project.status !== 'accepted'" class="section-gap">
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
          </template>
          <div v-else class="muted">{{ t('noProject') }}</div>
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
          <div v-if="canDevice && detail.project" class="form-grid section-gap">
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

        <div class="panel section-gap">
          <div class="panel-title">
            <h3>{{ t('tickets') }}</h3>
            <el-button link type="primary" @click="goTickets">{{ t('tickets') }}</el-button>
          </div>
          <el-table :data="detail.tickets" size="small" :empty-text="t('noData')">
            <el-table-column prop="title" :label="t('title')" min-width="160" />
            <el-table-column :label="t('priority')" width="100">
              <template #default="{ row }">{{ statusLabel(row.priority) }}</template>
            </el-table-column>
            <el-table-column :label="t('status')" width="110">
              <template #default="{ row }">{{ statusLabel(row.status) }}</template>
            </el-table-column>
            <el-table-column prop="created_by_name" :label="t('createdBy')" width="120" />
            <el-table-column :label="t('date')" width="150">
              <template #default="{ row }">{{ dt(row.created_at) }}</template>
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
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post, patch } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt, money, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const router = useRouter();
const orders = ref([]);
const directory = ref([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '' });
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const commissionPercent = ref(3);
const editing = ref(null);
const detailDrawer = ref(false);
const currentId = ref(null);
const detail = ref({ order: null, items: [], project: null, devices: [], progress: [], tickets: [] });
const assignForm = reactive({ electrical_engineer_id: null, structural_engineer_id: null });
const progressForm = reactive({ stage: 'start', note: '' });
const deviceForm = reactive({ category: 'inverter', model: '', name: '', serial_no: '', quantity: 1 });

const isManager = computed(() => ['super_admin', 'sales_manager'].includes(auth.role));
const showPrices = computed(() => ['super_admin', 'sales_manager', 'salesperson'].includes(auth.role));
const canAssign = computed(() => ['super_admin', 'sales_manager'].includes(auth.role));
const canProgress = computed(() => ['super_admin', 'electrical_engineer', 'structural_engineer', 'warehouse', 'after_sales'].includes(auth.role));
const canAccept = computed(() => ['super_admin', 'electrical_engineer', 'structural_engineer'].includes(auth.role));
const canDevice = computed(() => canProgress.value);

const engineers = computed(() => ({
  electrical: directory.value.filter((item) => item.role === 'electrical_engineer'),
  structural: directory.value.filter((item) => item.role === 'structural_engineer'),
}));

async function loadDirectory() {
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
    const data = await get(`/pv/api/workbench/orders?${params.toString()}`);
    orders.value = data.orders || [];
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
  reload();
}

function openCommission(row) {
  editing.value = row;
  commissionPercent.value = Number((Number(row.commission_rate || 0) * 100).toFixed(2));
  dialog.value = true;
}

async function saveCommission() {
  saving.value = true;
  try {
    await patch(`/pv/api/workbench/orders/${editing.value.id}`, { commission_rate: commissionPercent.value / 100 });
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
  currentId.value = row.id;
  detailDrawer.value = true;
  await loadDetail();
}

async function loadDetail() {
  try {
    const data = await get(`/pv/api/workbench/orders/${currentId.value}`);
    detail.value = {
      order: data.order, items: data.items || [], project: null, devices: [], progress: [], tickets: [],
    };
    try {
      const projectData = await get(`/pv/api/workbench/projects/by-order/${currentId.value}`);
      detail.value.project = projectData.project;
      detail.value.devices = projectData.devices || [];
      detail.value.progress = projectData.progress || [];
      assignForm.electrical_engineer_id = projectData.project.electrical_engineer_id;
      assignForm.structural_engineer_id = projectData.project.structural_engineer_id;
    } catch (error) {
      detail.value.project = null;
    }
    try {
      const ticketData = await get(`/pv/api/workbench/tickets?order_id=${currentId.value}&page_size=100`);
      detail.value.tickets = ticketData.tickets || [];
    } catch (error) {
      detail.value.tickets = [];
    }
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function refreshDetail() {
  await loadDetail();
  await load();
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

function goTickets() {
  detailDrawer.value = false;
  router.push('/workbench/tickets');
}

onMounted(() => {
  load();
  loadDirectory();
});
</script>

<style scoped>
@media (max-width: 768px) {
  .detail-grid { grid-template-columns: 1fr; }
  .panel-title { flex-wrap: wrap; gap: 8px; }
  .el-timeline { padding-left: 2px; }
}
</style>
