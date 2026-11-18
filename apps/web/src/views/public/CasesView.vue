<template>
  <div>
    <div class="page-toolbar">
      <div>
        <h3>{{ t('myCases') }}</h3>
        <div class="muted">{{ t('memberArea') }} · {{ auth.user?.name }}</div>
      </div>
      <el-button type="primary" :disabled="loading" @click="dialog = true">{{ t('create') }}</el-button>
    </div>

    <div class="panel">
      <el-table :data="cases" v-loading="loading" empty-text="暂无记录">
        <el-table-column prop="title" :label="t('caseName')" min-width="160" />
        <el-table-column :label="t('usageScenario')" min-width="160">
          <template #default="{ row }">{{ row.snapshot?.scenario || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('systemMode')" width="120">
          <template #default="{ row }">{{ row.snapshot?.mode || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="200">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="loading || saving" @click="copyLink(row)">分享</el-button>
            <el-button link type="danger" :disabled="loading || saving" @click="remove(row)">{{ t('delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
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

const { t } = useI18n();
const auth = useAuthStore();
const cases = ref([]);
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const form = reactive({ title: '', scenario: '', mode: 'offgrid', note: '' });

async function load() {
  loading.value = true;
  try {
    const data = await get('/pv/api/cases');
    cases.value = data.cases || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
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
    await load();
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
    await load();
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
