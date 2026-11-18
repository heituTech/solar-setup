<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('catalog') }}</h3>
      <div class="toolbar-actions">
        <el-select v-model="category" clearable :placeholder="t('category')" style="width: 160px" @change="load">
          <el-option v-for="item in categories" :key="item" :label="statusLabel(item)" :value="item" />
        </el-select>
        <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
        <el-button type="primary" :disabled="loading" @click="openCreate">{{ t('create') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <el-table :data="products" v-loading="loading" :empty-text="t('noData')">
        <el-table-column :label="t('category')" width="140">
          <template #default="{ row }">{{ statusLabel(row.category) }}</template>
        </el-table-column>
        <el-table-column prop="model" :label="t('reference')" width="160" />
        <el-table-column prop="name" :label="t('name')" min-width="180" />
        <el-table-column :label="t('unitPrice')" width="130">
          <template #default="{ row }">{{ money(row.price) }}</template>
        </el-table-column>
        <el-table-column :label="t('unit')" width="90">
          <template #default="{ row }">{{ statusLabel(row.unit) }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="110">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="120">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="loading" @click="openEdit(row)">{{ t('edit') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialog" :title="form.id ? t('edit') : t('create')" width="620px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item :label="t('category')"><el-input v-model="form.category" /></el-form-item>
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
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get, patch, post } from '../../api/client';
import { money, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const products = ref([]);
const categories = ['panel', 'inverter', 'battery', 'mounting', 'cable', 'accessory', 'service'];
const category = ref('');
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const form = reactive({ id: null, category: 'panel', model: '', name: '', price: 0, unit: 'pcs', status: 'active', note: '' });

async function load() {
  loading.value = true;
  try {
    const query = category.value ? `?category=${encodeURIComponent(category.value)}` : '';
    const data = await get(`/pv/api/products${query}`);
    products.value = data.products || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: null, category: 'panel', model: '', name: '', price: 0, unit: 'pcs', status: 'active', note: '' });
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
    await load();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
