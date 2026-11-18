<template>
  <div>
    <div class="page-toolbar">
      <div>
        <h3>{{ t('myCases') }}</h3>
        <div class="muted">{{ t('memberArea') }} · {{ auth.user?.name }}</div>
      </div>
      <el-button type="primary" :disabled="loading" @click="dialog = true">{{ t('create') }}</el-button>
    </div>

    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px">
      <el-input v-model="filters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reload" />
      <el-select v-model="filters.status" clearable :placeholder="t('status')" style="width:160px">
        <el-option :label="t('filterAll')" value="" />
        <el-option v-for="s in statusOptions" :key="s" :label="statusLabel(s)" :value="s" />
      </el-select>
      <el-button type="primary" :loading="loading" @click="reload">{{ t('filterSearch') }}</el-button>
      <el-button @click="resetFilters">{{ t('filterReset') }}</el-button>
    </div>

    <div class="panel">
      <el-table :data="cases" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="title" :label="t('caseName')" min-width="160" />
        <el-table-column :label="t('usageScenario')" min-width="160">
          <template #default="{ row }">{{ row.snapshot?.scenario || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('systemMode')" width="120">
          <template #default="{ row }">{{ statusLabel(row.snapshot?.mode) || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="200">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="loading || saving" @click="copyLink(row)">{{ t('share') }}</el-button>
            <el-button link type="danger" :disabled="loading || saving" @click="remove(row)">{{ t('delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        style="margin-top:12px; justify-content:flex-end"
        background
        layout="total, prev, pager, next, jumper"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="changePage"
      />
    </div>

    <el-dialog v-model="dialog" :title="t('create')" width="520px">
      <el-form :model="form" label-position="top">
        <el-form-item :label="t('caseName')"><el-input v-model="form.title" /></el-form-item>
        <el-form-item :label="t('usageScenario')"><el-input v-model="form.scenario" /></el-form-item>
        <el-form-item :label="t('systemMode')">
          <el-select v-model="form.mode" style="width: 100%">
            <el-option :label="t('offGrid')" value="offgrid" />
            <el-option :label="t('hybrid')" value="hybrid" />
            <el-option :label="t('gridAvailable')" value="ongrid" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('notes')"><el-input v-model="form.note" type="textarea" :rows="3" /></el-form-item>
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post, del } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const cases = ref([]);
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const filters = reactive({ q: '', status: '' });
const statusOptions = ['active'];
const form = reactive({ title: '', scenario: '', mode: 'offgrid', note: '' });

function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) search.set(key, value);
  });
  return search.toString();
}

async function load() {
  loading.value = true;
  try {
    const query = queryString({ page: page.value, page_size: pageSize.value, q: filters.q, status: filters.status });
    const data = await get(`/pv/api/cases?${query}`);
    cases.value = data.cases || [];
    total.value = Number(data.total) || 0;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function reload() {
  page.value = 1;
  return load();
}

function resetFilters() {
  Object.assign(filters, { q: '', status: '' });
  reload();
}

function changePage(next) {
  page.value = next;
  load();
}

async function save() {
  if (!form.title) return ElMessage.warning(t('caseName'));
  saving.value = true;
  try {
    await post('/pv/api/cases', {
      title: form.title,
      snapshot: { scenario: form.scenario, mode: form.mode, note: form.note },
    });
    dialog.value = false;
    form.title = '';
    ElMessage.success(t('caseSaved'));
    await reload();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(t('delete') + ` ${row.title}?`, t('confirm'));
    await del(`/pv/api/cases/${row.id}`);
    await reload();
  } catch (error) {
    if (error !== 'cancel' && error?.message) ElMessage.error(error.message);
  }
}

async function copyLink(row) {
  const link = `${window.location.origin}${import.meta.env.BASE_URL}api/cases/shared/${row.share_token}`;
  try {
    await navigator.clipboard.writeText(link);
    ElMessage.success(link);
  } catch {
    ElMessage.info(link);
  }
}

onMounted(load);
</script>
