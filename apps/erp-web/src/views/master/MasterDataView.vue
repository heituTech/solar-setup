<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post, patch, del } from '@/api/client';
import { money } from '@/utils/format';

const active = ref('stores');
const options = ref({ stores: [], products: [], suppliers: [], engineers: [], crews: [], captains: [], product_categories: [] });
const state = reactive({ items: [], total: 0, page: 1, page_size: 10, keyword: '', loading: false });
const dialog = ref(false);
const editingId = ref(null);
const form = ref({});

const CONFIGS = {
  stores: {
    label: '门店', api: 'stores',
    columns: [
      { prop: 'code', label: '编码', width: 100 }, { prop: 'name', label: '门店名称', minWidth: 160 },
      { prop: 'region', label: '地区', width: 130 }, { prop: 'address', label: '地址', minWidth: 200 },
      { prop: 'phone', label: '电话', width: 140 }, { prop: 'manager_name', label: '店长', width: 110 },
      { prop: 'status', label: '状态', width: 90 },
    ],
    fields: [
      { key: 'name', label: '门店名称', required: true }, { key: 'region', label: '地区' },
      { key: 'address', label: '地址' }, { key: 'phone', label: '电话' }, { key: 'manager_name', label: '店长' },
    ],
  },
  products: {
    label: '产品', api: 'products',
    columns: [
      { prop: 'code', label: '编码', width: 100 }, { prop: 'name', label: '产品名称', minWidth: 180 },
      { prop: 'category', label: '分类', width: 110 }, { prop: 'brand', label: '品牌', width: 110 },
      { prop: 'model', label: '型号', width: 140 }, { prop: 'unit', label: '单位', width: 70 },
      { prop: 'sale_price', label: '售价', width: 110 }, { prop: 'cost_price', label: '成本', width: 110 },
      { prop: 'status', label: '状态', width: 90 },
    ],
    fields: [
      { key: 'name', label: '产品名称', required: true },
      { key: 'category', label: '分类', type: 'select', optionKey: 'product_categories' },
      { key: 'brand', label: '品牌' }, { key: 'model', label: '型号' }, { key: 'spec', label: '规格' },
      { key: 'unit', label: '单位' },
      { key: 'sale_price', label: '销售价', type: 'number' }, { key: 'cost_price', label: '成本价', type: 'number' },
      { key: 'supplier_id', label: '供应商', type: 'select', optionKey: 'suppliers', valueKey: 'id', labelKey: 'name' },
    ],
  },
  suppliers: {
    label: '供应商', api: 'suppliers',
    columns: [
      { prop: 'code', label: '编码', width: 100 }, { prop: 'name', label: '供应商', minWidth: 180 },
      { prop: 'contact', label: '联系人', width: 110 }, { prop: 'phone', label: '电话', width: 140 },
      { prop: 'address', label: '地址', minWidth: 200 }, { prop: 'status', label: '状态', width: 90 },
    ],
    fields: [
      { key: 'name', label: '供应商名称', required: true }, { key: 'contact', label: '联系人' },
      { key: 'phone', label: '电话' }, { key: 'address', label: '地址' },
    ],
  },
  engineers: {
    label: '工程师', api: 'engineers',
    columns: [
      { prop: 'code', label: '编码', width: 100 }, { prop: 'name', label: '姓名', width: 120 },
      { prop: 'type', label: '类型', width: 110 }, { prop: 'phone', label: '电话', width: 140 },
      { prop: 'status', label: '状态', width: 90 },
    ],
    fields: [
      { key: 'name', label: '姓名', required: true },
      { key: 'type', label: '类型', type: 'select', inlineOptions: [{ value: 'electrical', label: '电气工程师' }, { value: 'structural', label: '结构工程师' }] },
      { key: 'phone', label: '电话' },
      { key: 'user_id', label: '关联账号ID', type: 'number' },
    ],
  },
  crews: {
    label: '班组', api: 'crews',
    columns: [
      { prop: 'code', label: '编码', width: 100 }, { prop: 'name', label: '班组名称', minWidth: 160 },
      { prop: 'leader_name', label: '队长', width: 110 }, { prop: 'phone', label: '电话', width: 140 },
      { prop: 'store_id', label: '所属门店', width: 110 }, { prop: 'status', label: '状态', width: 90 },
    ],
    fields: [
      { key: 'name', label: '班组名称', required: true }, { key: 'leader_name', label: '队长姓名' },
      { key: 'captain_user_id', label: '队长账号', type: 'select', optionKey: 'captains', valueKey: 'id', labelKey: 'name' },
      { key: 'phone', label: '电话' },
      { key: 'store_id', label: '所属门店', type: 'select', optionKey: 'stores', valueKey: 'id', labelKey: 'name' },
    ],
  },
};

const config = computed(() => CONFIGS[active.value]);
const categoryLabel = (value) => (options.value.product_categories.find((item) => item.value === value) || {}).label || value;
const cellText = (row, prop) => {
  if (prop === 'category') return categoryLabel(row.category);
  if (prop === 'status') return row.status === 'inactive' ? '停用' : '启用';
  if (prop === 'type') return row.type === 'electrical' ? '电气' : '结构';
  if (['sale_price', 'cost_price'].includes(prop)) return money(row[prop]);
  if (prop === 'store_id') return (options.value.stores.find((store) => store.id === row.store_id) || {}).name || row.store_id || '-';
  return row[prop] ?? '-';
};

async function load() {
  state.loading = true;
  try {
    const data = await get(`/master/${config.value.api}?page=${state.page}&page_size=${state.page_size}&keyword=${encodeURIComponent(state.keyword)}`);
    state.items = data.items;
    state.total = data.total;
  } finally { state.loading = false; }
}
async function loadOptions() { options.value = await get('/master/options'); }

function switchTab() { state.page = 1; state.keyword = ''; load(); }

function openCreate() {
  const payload = {};
  for (const field of config.value.fields) payload[field.key] = field.type === 'number' ? 0 : (field.type === 'select' ? null : '');
  form.value = payload;
  editingId.value = null;
  dialog.value = true;
}
function openEdit(row) {
  const payload = {};
  for (const field of config.value.fields) payload[field.key] = row[field.key] ?? (field.type === 'number' ? 0 : null);
  form.value = payload;
  editingId.value = row.id;
  dialog.value = true;
}
async function save() {
  try {
    if (editingId.value) await patch(`/master/${config.value.api}/${editingId.value}`, form.value);
    else await post(`/master/${config.value.api}`, form.value);
    ElMessage.success('已保存');
    dialog.value = false;
    await load();
  } catch (error) { ElMessage.error(error.message || '保存失败'); }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认停用「${row.name}」？`, '提示', { type: 'warning' });
    await del(`/master/${config.value.api}/${row.id}`);
    ElMessage.success('已停用');
    await load();
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.message); }
}
function fieldOptions(field) {
  if (field.inlineOptions) return field.inlineOptions;
  return (options.value[field.optionKey] || []).map((item) => ({
    value: item[field.valueKey || 'value'],
    label: item[field.labelKey || 'label'],
  }));
}

onMounted(async () => { await loadOptions(); await load(); });
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-title">主数据（简易 MDM）</div>
      <el-button type="primary" @click="openCreate">+ 新增{{ config.label }}</el-button>
    </div>
    <el-tabs v-model="active" type="border-card" @tab-change="switchTab">
      <el-tab-pane v-for="(item, key) in CONFIGS" :key="key" :label="item.label" :name="key" />
    </el-tabs>
    <div class="filters mt12">
      <el-input v-model="state.keyword" placeholder="编码 / 名称 / 关键字" clearable style="width:240px" @keyup.enter="state.page = 1; load()" />
      <el-button @click="state.page = 1; load()">查询</el-button>
    </div>
    <el-table :data="state.items" v-loading="state.loading" border size="small">
      <el-table-column v-for="column in config.columns" :key="column.prop" :label="column.label"
        :width="column.width" :min-width="column.minWidth">
        <template #default="{ row }">{{ cellText(row, column.prop) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" text type="danger" @click="remove(row)">停用</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="mt12" layout="total, prev, pager, next" :total="state.total" :page-size="state.page_size"
      v-model:current-page="state.page" @current-change="load" />

    <el-dialog v-model="dialog" :title="`${editingId ? '编辑' : '新增'}${config.label}`" width="520px">
      <el-form label-width="110px">
        <el-form-item v-for="field in config.fields" :key="field.key" :label="field.label" :required="field.required">
          <el-select v-if="field.type === 'select'" v-model="form[field.key]" clearable filterable style="width:100%">
            <el-option v-for="item in fieldOptions(field)" :key="item.value" :value="item.value" :label="item.label" />
          </el-select>
          <el-input-number v-else-if="field.type === 'number'" v-model="form[field.key]" :min="0" :precision="2" style="width:100%" />
          <el-input v-else v-model="form[field.key]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
