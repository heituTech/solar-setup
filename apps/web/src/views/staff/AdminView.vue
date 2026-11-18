<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane :label="t('users')" name="users">
        <div class="page-toolbar">
          <h3>{{ t('users') }}</h3>
          <div class="toolbar-actions">
            <el-button @click="loadUsers" :loading="loadingUsers">{{ t('refresh') }}</el-button>
            <el-button v-if="isAdmin" type="primary" :disabled="loadingUsers" @click="openCreate">{{ t('create') }}</el-button>
          </div>
        </div>

        <div class="panel">
          <el-table :data="users" v-loading="loadingUsers" :empty-text="t('noData')">
            <el-table-column prop="id" :label="t('staffId')" width="90" />
            <el-table-column prop="name" :label="t('name')" min-width="130" />
            <el-table-column prop="email" :label="t('email')" min-width="180" />
            <el-table-column prop="phone" :label="t('phone')" width="140" />
            <el-table-column :label="t('role')" width="150">
              <template #default="{ row }">{{ roleLabel(row.role) }}</template>
            </el-table-column>
            <el-table-column :label="t('owner')" width="130">
              <template #default="{ row }">{{ managerName(row.manager_id) }}</template>
            </el-table-column>
            <el-table-column :label="t('status')" width="110">
              <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
            </el-table-column>
            <el-table-column :label="t('actions')" width="110">
              <template #default="{ row }">
                <el-button v-if="isAdmin" link type="primary" @click="openEdit(row)">{{ t('edit') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('approvals')" name="approvals">
        <div class="page-toolbar">
          <h3>{{ t('approvals') }}</h3>
          <div class="toolbar-actions">
            <el-button @click="loadApprovals" :loading="loadingApprovals">{{ t('refresh') }}</el-button>
          </div>
        </div>

        <div class="panel">
          <el-table :data="approvals" v-loading="loadingApprovals" :empty-text="t('noData')">
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column prop="type" :label="t('type')" width="160" />
            <el-table-column prop="requester_name" :label="t('owner')" width="130" />
            <el-table-column :label="t('detail')" min-width="260">
              <template #default="{ row }"><span class="mono">{{ summary(row.payload) }}</span></template>
            </el-table-column>
            <el-table-column :label="t('status')" width="110">
              <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
            </el-table-column>
            <el-table-column :label="t('date')" width="160">
              <template #default="{ row }">{{ dt(row.created_at) }}</template>
            </el-table-column>
            <el-table-column :label="t('actions')" width="190">
              <template #default="{ row }">
                <template v-if="row.status === 'pending' && canDecide">
                  <el-button link type="success" :disabled="saving" @click="decide(row, 'approved')">{{ t('approve') }}</el-button>
                  <el-button link type="danger" :disabled="saving" @click="decide(row, 'rejected')">{{ t('reject') }}</el-button>
                </template>
                <span v-else>{{ row.decision_note || '-' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="dialog" :title="form.id ? t('edit') : t('create')" width="620px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item :label="t('name')"><el-input v-model="form.name" /></el-form-item>
          <el-form-item :label="t('email')"><el-input v-model="form.email" /></el-form-item>
          <el-form-item :label="t('phone')"><el-input v-model="form.phone" /></el-form-item>
          <el-form-item :label="t('role')">
            <el-select v-model="form.role" style="width: 100%">
              <el-option v-for="item in roles" :key="item" :label="roleLabel(item)" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('owner')">
            <el-select v-model="form.manager_id" clearable style="width: 100%">
              <el-option v-for="item in managers" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option :label="t('active')" value="active" />
              <el-option :label="t('disabled')" value="disabled" />
            </el-select>
          </el-form-item>
          <el-form-item class="span-2" :label="form.id ? `${t('password')} (${t('optional')})` : t('password')">
            <el-input v-model="form.password" type="password" show-password />
          </el-form-item>
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
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, patch, post } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt, statusType } from '../../utils/format';

const { t } = useI18n();
const auth = useAuthStore();
const tab = ref('users');
const users = ref([]);
const approvals = ref([]);
const loadingUsers = ref(false);
const loadingApprovals = ref(false);
const saving = ref(false);
const dialog = ref(false);
const roles = ['super_admin', 'sales_manager', 'salesperson', 'electrical_engineer', 'structural_engineer', 'warehouse', 'accountant', 'after_sales', 'member'];
const form = reactive({ id: null, name: '', email: '', phone: '', role: 'salesperson', manager_id: null, status: 'active', password: '' });

const isAdmin = computed(() => auth.role === 'super_admin');
const canDecide = computed(() => ['super_admin', 'sales_manager'].includes(auth.role));
const managers = computed(() => users.value.filter((item) => ['super_admin', 'sales_manager'].includes(item.role)));

function roleLabel(role) {
  if (!role) return '-';
  const key = `role_${role}`;
  const label = t(key);
  return label === key ? role : label;
}

function managerName(id) {
  if (!id) return '-';
  return users.value.find((item) => item.id === Number(id))?.name || `#${id}`;
}

function summary(payload) {
  if (!payload) return '-';
  const text = JSON.stringify(payload);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

async function loadUsers() {
  loadingUsers.value = true;
  try {
    const data = await get('/pv/api/admin/users');
    users.value = data.users || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loadingUsers.value = false;
  }
}

async function loadApprovals() {
  loadingApprovals.value = true;
  try {
    const data = await get('/pv/api/approvals');
    approvals.value = data.approvals || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loadingApprovals.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: null, name: '', email: '', phone: '', role: 'salesperson', manager_id: null, status: 'active', password: '' });
  dialog.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id, name: row.name, email: row.email || '', phone: row.phone || '',
    role: row.role, manager_id: row.manager_id || null, status: row.status, password: '',
  });
  dialog.value = true;
}

async function save() {
  if (!form.name) return ElMessage.warning(t('name'));
  if (!form.id && !form.email && !form.phone) return ElMessage.warning(`${t('email')} / ${t('phone')}`);
  if (!form.id && String(form.password).length < 8) return ElMessage.warning(t('password'));
  saving.value = true;
  try {
    const payload = {
      name: form.name, email: form.email, phone: form.phone, role: form.role,
      manager_id: form.manager_id || null, status: form.status,
    };
    if (form.password) payload.password = form.password;
    if (form.id) await patch(`/pv/api/admin/users/${form.id}`, payload);
    else await post('/pv/api/admin/users', payload);
    ElMessage.success(t('operationSuccess'));
    dialog.value = false;
    await loadUsers();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function decide(row, decision) {
  saving.value = true;
  try {
    const { value } = await ElMessageBox.prompt(t('notes'), decision === 'approved' ? t('approve') : t('reject'), {
      inputType: 'textarea',
      inputPlaceholder: t('optional'),
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
    });
    await post(`/pv/api/approvals/${row.id}/decide`, { decision, note: value || '' });
    ElMessage.success(t('operationSuccess'));
    await loadApprovals();
  } catch (error) {
    if (error?.message && error.message !== 'cancel') ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadUsers(), loadApprovals()]);
});
</script>
