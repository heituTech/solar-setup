<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('orders') }}</h3>
      <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
    </div>

    <div class="panel">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px">
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
        <el-table-column :label="t('orderAmount')" width="130">
          <template #default="{ row }">{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('receivedAmount')" width="130">
          <template #default="{ row }">{{ money(row.received_amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('outstanding')" width="130">
          <template #default="{ row }">{{ money(row.outstanding) }}</template>
        </el-table-column>
        <el-table-column :label="t('commissionRate')" width="130">
          <template #default="{ row }">{{ (row.commission_rate * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="150">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="210">
          <template #default="{ row }">
            <el-button v-if="isManager && row.status !== 'accepted'" link type="primary" :disabled="loading || saving" @click="openCommission(row)">{{ t('commissionRate') }}</el-button>
            <el-button v-if="row.project_id" link :disabled="loading" @click="$router.push('/workbench/projects')">{{ t('projects') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="(p) => { page.value = p; load(); }" />
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
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get, patch } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { money, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const orders = ref([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '' });
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const commissionPercent = ref(3);
const editing = ref(null);
const isManager = computed(() => ['super_admin', 'sales_manager'].includes(auth.role));

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
  commissionPercent.value = Number((row.commission_rate * 100).toFixed(2));
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

onMounted(load);
</script>
