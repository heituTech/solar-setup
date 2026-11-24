<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('catalog') }}</h3>
      <div class="toolbar-actions">
        <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
        <el-button type="primary" :disabled="loading" @click="openCreate">{{ t('create') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <div class="filter-row">
        <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
        <el-select v-model="filters.category" clearable :placeholder="t('category')" style="width:180px">
          <el-option v-for="item in categories" :key="item" :label="statusLabel(item)" :value="item" />
        </el-select>
        <el-select v-model="filters.status" clearable :placeholder="t('status')" style="width:150px">
          <el-option :label="t('filterAll')" value="" />
          <el-option v-for="s in ['active','disabled']" :key="s" :label="statusLabel(s)" :value="s" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
        <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
      </div>
      <el-table :data="products" v-loading="loading" :empty-text="t('noData')">
        <el-table-column :label="t('category')" width="150">
          <template #default="{ row }">{{ statusLabel(row.category) }}</template>
        </el-table-column>
        <el-table-column prop="model" :label="t('reference')" width="160" />
        <el-table-column prop="name" :label="t('name')" min-width="180" />
        <el-table-column :label="t('unitPrice')" width="130">
          <template #default="{ row }">{{ money(row.price) }}</template>
        </el-table-column>
        <el-table-column :label="t('unit')" width="100">
          <template #default="{ row }">{{ row.unit }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="100">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="loading" @click="openEdit(row)">{{ t('edit') }}</el-button>
            <el-button link type="primary" :disabled="loading" @click="openLogs(row)">{{ t('changeLog') }}</el-button>
            <el-button link type="danger" :disabled="loading" @click="remove(row)">{{ t('delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPage" />
    </div>

    <el-dialog v-model="dialog" :title="form.id ? t('edit') : t('create')" width="620px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item :label="t('category')">
            <el-select v-model="form.category" style="width: 100%" @change="onCategoryChange">
              <el-option v-for="item in categories" :key="item" :label="statusLabel(item)" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('reference')"><el-input v-model="form.model" /></el-form-item>
          <el-form-item class="span-2" :label="t('name')"><el-input v-model="form.name" /></el-form-item>
          <el-form-item :label="t('unitPrice')">
            <el-input-number v-model="form.price" :min="0" :precision="2" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('unit')"><el-input v-model="form.unit" /></el-form-item>
          <el-form-item :label="t('status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option :label="t('active')" value="active" />
              <el-option :label="t('disabled')" value="disabled" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('notes')"><el-input v-model="form.note" /></el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="logDrawer" :title="`${t('changeLog')} · ${logProduct?.name || ''}`" size="480px">
      <el-timeline v-if="logs.length">
        <el-timeline-item v-for="log in logs" :key="log.id" :timestamp="log.created_at" placement="top">
          <div class="log-head">
            <el-tag :type="actionTagType(log.action)">{{ actionLabel(log.action) }}</el-tag>
            <span class="log-op">{{ log.operator_name || '—' }}</span>
            <span v-if="log.approval_id" class="log-approval">#{{ log.approval_id }}</span>
          </div>
          <div v-if="log.action === 'update'" class="log-diff">
            <div class="log-col"><div class="log-col-title">{{ t('edit') }} · before</div><pre>{{ fmt(log.before_data) }}</pre></div>
            <div class="log-col"><div class="log-col-title">after</div><pre>{{ fmt(log.after_data) }}</pre></div>
          </div>
          <div v-else-if="log.action === 'create'" class="log-diff">
            <pre>{{ fmt(log.after_data) }}</pre>
          </div>
          <div v-else class="log-diff">
            <pre>{{ fmt(log.before_data) }}</pre>
          </div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else :description="t('noData')" />
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { del, get, patch, post } from '../../api/client';
import { money, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();

// 用户可选的 7 个英文分类（与后端 lib/products.js 保持一致；同时会从接口拉取做兜底校验）
const CATEGORIES = ['PV module', 'Invertor', 'battery', 'mounting bracket', 'Cable', 'Color Coated Steel Tile', 'Other'];
const DEFAULT_UNITS = {
  'PV module': 'pcs',
  'Invertor': 'pcs',
  'battery': 'pcs',
  'mounting bracket': '米',
  'Cable': '米',
  'Color Coated Steel Tile': '平方米',
  'Other': 'pcs',
};

const products = ref([]);
const categories = ref([...CATEGORIES]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', category: '', status: '' });
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const form = reactive({ id: null, category: 'PV module', model: '', name: '', price: 0, unit: 'pcs', status: 'active', note: '' });

const logDrawer = ref(false);
const logProduct = ref(null);
const logs = ref([]);

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), page_size: '10' });
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.category) params.set('category', filters.category);
    if (filters.status) params.set('status', filters.status);
    const data = await get(`/pv/api/products?${params.toString()}`);
    products.value = data.products || [];
    total.value = data.total || 0;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function loadCategories() {
  try {
    const data = await get('/pv/api/products/categories');
    if (Array.isArray(data.categories) && data.categories.length) categories.value = data.categories;
  } catch {
    categories.value = [...CATEGORIES];
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
  filters.category = '';
  filters.status = '';
  reload();
}

function defaultUnitOf(category) {
  return DEFAULT_UNITS[category] || 'pcs';
}

// 切换分类时：新建且未填单位，或单位为空，则自动填充默认单位
function onCategoryChange(val) {
  if (!form.unit) form.unit = defaultUnitOf(val);
}

function openCreate() {
  Object.assign(form, { id: null, category: 'PV module', model: '', name: '', price: 0, unit: defaultUnitOf('PV module'), status: 'active', note: '' });
  dialog.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id, category: row.category, model: row.model, name: row.name,
    price: row.price, unit: row.unit || '', status: row.status, note: row.specs?.note || '',
  });
  dialog.value = true;
}

async function save() {
  if (!form.category || !form.model || !form.name) return ElMessage.warning(`${t('category')} / ${t('reference')} / ${t('name')}`);
  saving.value = true;
  try {
    const payload = {
      category: form.category, model: form.model, name: form.name, price: form.price,
      unit: form.unit, status: form.status, specs: { note: form.note },
    };
    const result = form.id
      ? await patch(`/pv/api/products/${form.id}`, payload)
      : await post('/pv/api/products', payload);
    if (result.pending_approval) ElMessage.warning(`${t('pending')} #${result.approval_id}`);
    else ElMessage.success(t('operationSuccess'));
    dialog.value = false;
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
  try {
    const result = await del(`/pv/api/products/${row.id}`);
    if (result.pending_approval) ElMessage.warning(`${t('pending')} #${result.approval_id}`);
    else ElMessage.success(t('operationSuccess'));
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function openLogs(row) {
  logProduct.value = row;
  logDrawer.value = true;
  logs.value = [];
  try {
    const data = await get(`/pv/api/products/logs?product_id=${row.id}&page_size=50`);
    logs.value = data.logs || [];
  } catch (error) {
    ElMessage.error(error.message);
  }
}

function actionLabel(action) {
  if (action === 'create') return t('create');
  if (action === 'update') return t('edit');
  if (action === 'delete') return t('delete');
  return action;
}

function actionTagType(action) {
  return action === 'delete' ? 'danger' : action === 'create' ? 'success' : 'warning';
}

function fmt(value) {
  if (value === null || value === undefined) return '—';
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

onMounted(() => { loadCategories(); load(); });
</script>

<style scoped>
.log-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.log-op { font-weight: 600; }
.log-approval { color: var(--el-text-color-secondary); font-size: 12px; }
.log-diff { display: flex; gap: 8px; }
.log-col { flex: 1; min-width: 0; }
.log-col-title { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 2px; }
.log-diff pre { background: var(--el-fill-color-light); padding: 8px; border-radius: 4px; font-size: 12px; max-height: 240px; overflow: auto; margin: 0; }
</style>
