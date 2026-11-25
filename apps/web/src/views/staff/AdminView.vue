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

        <div class="filter-row">
          <el-input v-model="userFilters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reloadUsers" />
          <el-select v-model="userFilters.role" clearable :placeholder="t('role')" style="width:160px">
            <el-option :label="t('filterAll')" value="" />
            <el-option v-for="r in roles" :key="r" :label="roleLabel(r)" :value="r" />
          </el-select>
          <el-select v-model="userFilters.status" clearable :placeholder="t('status')" style="width:160px">
            <el-option :label="t('filterAll')" value="" />
            <el-option v-for="s in userStatusOptions" :key="s" :label="statusLabel(s)" :value="s" />
          </el-select>
          <el-button type="primary" :loading="loadingUsers" @click="reloadUsers">{{ t('filterSearch') }}</el-button>
          <el-button @click="resetUserFilters">{{ t('filterReset') }}</el-button>
        </div>

        <div class="panel">
          <el-table :data="users" v-loading="loadingUsers" :empty-text="t('noData')">
            <el-table-column prop="user_no" :label="t('userId')" width="110" />
            <el-table-column prop="name" :label="t('name')" min-width="130" />
            <el-table-column prop="email" :label="t('email')" min-width="180" />
            <el-table-column prop="phone" :label="t('phone')" width="140" />
            <el-table-column :label="t('role')" width="150">
              <template #default="{ row }">{{ roleLabel(row.role) }}</template>
            </el-table-column>
            <el-table-column :label="t('position')" width="160">
              <template #default="{ row }">{{ row.position_name || t('vacancy') }}</template>
            </el-table-column>
            <el-table-column :label="t('owner')" width="130">
              <template #default="{ row }">{{ managerName(row.manager_id) }}</template>
            </el-table-column>
            <el-table-column :label="t('status')" width="110">
              <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
            </el-table-column>
            <el-table-column :label="t('actions')" width="110">
              <template #default="{ row }">
                <el-button v-if="isAdmin" link type="primary" @click="openEdit(row)">{{ t('edit') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            style="margin-top:12px; justify-content:flex-end"
            background
            layout="total, prev, pager, next, jumper"
            :total="usersTotal"
            :page-size="usersPageSize"
            :current-page="usersPage"
            @current-change="changeUsersPage"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('approvals')" name="approvals">
        <div class="page-toolbar">
          <h3>{{ t('approvals') }}</h3>
          <div class="toolbar-actions">
            <el-button @click="loadApprovals" :loading="loadingApprovals">{{ t('refresh') }}</el-button>
          </div>
        </div>

        <div class="filter-row">
          <el-input v-model="approvalFilters.q" :placeholder="t('filterKeyword')" clearable style="width:220px" @keyup.enter="reloadApprovals" />
          <el-select v-model="approvalFilters.status" clearable :placeholder="t('status')" style="width:160px">
            <el-option :label="t('filterAll')" value="" />
            <el-option v-for="s in approvalStatusOptions" :key="s" :label="statusLabel(s)" :value="s" />
          </el-select>
          <el-button type="primary" :loading="loadingApprovals" @click="reloadApprovals">{{ t('filterSearch') }}</el-button>
          <el-button @click="resetApprovalFilters">{{ t('filterReset') }}</el-button>
        </div>

        <div class="panel">
          <el-table :data="approvals" v-loading="loadingApprovals" :empty-text="t('noData')">
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column :label="t('type')" width="160">
              <template #default="{ row }">{{ statusLabel(row.type) }}</template>
            </el-table-column>
            <el-table-column prop="requester_name" :label="t('owner')" width="130" />
            <el-table-column :label="t('detail')" min-width="260">
              <template #default="{ row }"><span class="mono">{{ summary(row.payload) }}</span></template>
            </el-table-column>
            <el-table-column :label="t('status')" width="110">
              <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
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
          <el-pagination
            style="margin-top:12px; justify-content:flex-end"
            background
            layout="total, prev, pager, next, jumper"
            :total="approvalTotal"
            :page-size="approvalPageSize"
            :current-page="approvalPage"
            @current-change="changeApprovalPage"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('orgStructure')" name="org">
        <div class="page-toolbar">
          <h3>{{ t('orgStructure') }}</h3>
          <div class="toolbar-actions">
            <el-button @click="loadOrg" :loading="loadingOrg">{{ t('refresh') }}</el-button>
          </div>
        </div>
        <div class="panel" v-for="dept in org.departments || []" :key="dept.id" style="margin-bottom:12px">
          <div class="panel-title"><h3>{{ dept.name }}</h3></div>
          <el-table :data="dept.positions" :empty-text="t('noData')">
            <el-table-column prop="name" :label="t('position')" min-width="160" />
            <el-table-column :label="t('positionLevel')" width="130">
              <template #default="{ row }">{{ levelLabel(row.level) }}</template>
            </el-table-column>
            <el-table-column :label="t('currentHolder')" min-width="200">
              <template #default="{ row }">
                <template v-if="row.holders.length">
                  <el-tag v-for="holder in row.holders" :key="holder.id" style="margin-right:6px">{{ holder.name }}</el-tag>
                </template>
                <el-tag v-else type="info">{{ t('vacancy') }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('actions')" width="200">
              <template #default="{ row }">
                <el-button v-if="isAdmin" link type="primary" @click="openAssign(row, dept.name)">{{ t('assign') }}</el-button>
                <el-button v-if="isAdmin && row.holders.length" link type="danger" @click="vacate(row)">{{ t('vacate') }}</el-button>
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
            <el-select v-model="form.role" style="width: 100%" @change="onRoleChange">
              <el-option v-for="item in roles" :key="item" :label="roleLabel(item)" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('position')">
            <el-select v-model="form.position_id" clearable style="width: 100%" @change="onPositionChange">
              <el-option
                v-for="item in positionOptions"
                :key="item.id"
                :label="`${item.name} · ${item.department_name}`"
                :value="item.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('owner')">
            <el-select v-model="form.manager_id" clearable :disabled="!!form.position_id" style="width: 100%">
              <el-option v-for="item in managerOptions" :key="item.id" :label="`${item.name} · ${roleLabel(item.role)}`" :value="item.id" />
            </el-select>
            <div v-if="form.position_id" class="muted">{{ t('managerByPosition') }}</div>
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

    <el-dialog v-model="assignDialog" :title="t('assign')" width="480px">
      <el-form label-position="top">
        <el-form-item :label="t('position')">
          <span>{{ assignPosition.name }} · {{ assignPosition.department_name }}</span>
        </el-form-item>
        <el-form-item :label="t('users')">
          <el-select v-model="assignForm.user_id" filterable style="width: 100%">
            <el-option v-for="item in assignCandidates" :key="item.id" :label="`${item.name} · ${roleLabel(item.role)}`" :value="item.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveAssign">{{ t('save') }}</el-button>
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
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const tab = ref('users');
const users = ref([]);
const approvals = ref([]);
const directory = ref([]);
const loadingUsers = ref(false);
const loadingApprovals = ref(false);
const saving = ref(false);
const dialog = ref(false);
const usersPage = ref(1);
const usersPageSize = ref(10);
const usersTotal = ref(0);
const approvalPage = ref(1);
const approvalPageSize = ref(10);
const approvalTotal = ref(0);
const userFilters = reactive({ q: '', role: '', status: '' });
const approvalFilters = reactive({ q: '', status: '' });
const userStatusOptions = ['active', 'disabled'];
const approvalStatusOptions = ['pending', 'approved', 'rejected'];
const roles = ['super_admin', 'sales_manager', 'engineering_manager', 'finance_manager', 'hr_manager', 'salesperson', 'electrical_engineer', 'structural_engineer', 'warehouse', 'accountant', 'after_sales', 'after_sales_manager', 'member'];
const form = reactive({ id: null, name: '', email: '', phone: '', role: 'salesperson', manager_id: null, position_id: null, status: 'active', password: '' });
const org = ref({ departments: [] });
const loadingOrg = ref(false);
const assignDialog = ref(false);
const assignPosition = reactive({ id: null, name: '', department_name: '', role_key: null });
const assignForm = reactive({ user_id: null });

const isAdmin = computed(() => auth.role === 'super_admin');
const canDecide = computed(() => ['super_admin', 'sales_manager'].includes(auth.role));
// 员工所属上级约束：销售人员只能归属销售部门经理；工程师只能归属工程部经理或超级管理员
const MANAGER_ROLES_BY_ROLE = {
  salesperson: ['sales_manager'],
  electrical_engineer: ['engineering_manager', 'super_admin'],
  structural_engineer: ['engineering_manager', 'super_admin'],
};
const managerOptions = computed(() => {
  const allowed = MANAGER_ROLES_BY_ROLE[form.role] || ['super_admin', 'sales_manager'];
  const options = directory.value.filter((item) => allowed.includes(item.role));
  // 兜底：当前所属人不在目录中时仍保留原值，避免编辑时被清空
  if (form.manager_id && !options.some((item) => item.id === Number(form.manager_id))) {
    const found = users.value.find((item) => item.id === Number(form.manager_id));
    if (found) options.push({ id: found.id, name: found.name, role: found.role });
  }
  return options;
});
// 手动切换角色时清空已选择的负责人与职位，避免沿用上一个角色的归属
function onRoleChange() {
  form.manager_id = null;
  form.position_id = null;
}

const allPositions = computed(() => (org.value.departments || []).flatMap((dept) => (
  dept.positions.map((position) => ({ ...position, department_name: dept.name }))
)));
const positionOptions = computed(() => allPositions.value.filter(
  (position) => !position.role_key || position.role_key === form.role
));
const assignCandidates = computed(() => directory.value.filter(
  (item) => !assignPosition.role_key || item.role === assignPosition.role_key
));
const levelLabelMap = { 1: 'level_company', 2: 'level_department', 3: 'level_staff' };
function levelLabel(level) {
  return t(levelLabelMap[level] || 'level_staff');
}
// 职位所属负责人由上级职位在岗人员自动确定
function positionManagerId(positionId) {
  const position = allPositions.value.find((item) => item.id === Number(positionId));
  if (!position || !position.parent_id) return null;
  const parent = allPositions.value.find((item) => item.id === Number(position.parent_id));
  return parent && parent.holders.length ? parent.holders[0].id : null;
}
function onPositionChange(positionId) {
  form.manager_id = positionManagerId(positionId);
}

function roleLabel(role) {
  if (!role) return '-';
  const key = `role_${role}`;
  const label = t(key);
  return label === key ? role : label;
}

function managerName(id) {
  if (!id) return '-';
  const found = directory.value.find((item) => item.id === Number(id)) || users.value.find((item) => item.id === Number(id));
  return found?.name || `#${id}`;
}

function summary(payload) {
  if (!payload) return '-';
  const text = JSON.stringify(payload);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) search.set(key, value);
  });
  return search.toString();
}

async function loadUsers() {
  loadingUsers.value = true;
  try {
    const query = queryString({
      page: usersPage.value,
      page_size: usersPageSize.value,
      q: userFilters.q,
      role: userFilters.role,
      status: userFilters.status,
    });
    const data = await get(`/pv/api/admin/users?${query}`);
    users.value = data.users || [];
    usersTotal.value = Number(data.total) || 0;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loadingUsers.value = false;
  }
}

async function loadApprovals() {
  loadingApprovals.value = true;
  try {
    const query = queryString({
      page: approvalPage.value,
      page_size: approvalPageSize.value,
      q: approvalFilters.q,
      status: approvalFilters.status,
    });
    const data = await get(`/pv/api/approvals?${query}`);
    approvals.value = data.approvals || [];
    approvalTotal.value = Number(data.total) || 0;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loadingApprovals.value = false;
  }
}

async function loadDirectory() {
  try {
    const data = await get('/pv/api/workbench/directory');
    directory.value = data.users || [];
  } catch {
    directory.value = [];
  }
}

async function loadOrg() {
  loadingOrg.value = true;
  try {
    org.value = await get('/pv/api/org/structure');
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loadingOrg.value = false;
  }
}

function openAssign(position, departmentName) {
  Object.assign(assignPosition, {
    id: position.id, name: position.name,
    department_name: departmentName || '', role_key: position.role_key || null,
  });
  assignForm.user_id = position.holders.length ? position.holders[0].id : null;
  assignDialog.value = true;
  loadDirectory();
}

async function saveAssign() {
  if (!assignForm.user_id) return ElMessage.warning(t('users'));
  saving.value = true;
  try {
    await post(`/pv/api/org/positions/${assignPosition.id}/assign`, { user_id: assignForm.user_id });
    ElMessage.success(t('operationSuccess'));
    assignDialog.value = false;
    await Promise.all([loadOrg(), reloadUsers(), loadDirectory()]);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function vacate(position) {
  try {
    await ElMessageBox.confirm(t('vacateConfirm'), t('vacate'), {
      type: 'warning', confirmButtonText: t('confirm'), cancelButtonText: t('cancel'),
    });
  } catch {
    return;
  }
  saving.value = true;
  try {
    await post(`/pv/api/org/positions/${position.id}/vacate`, {});
    ElMessage.success(t('operationSuccess'));
    await Promise.all([loadOrg(), reloadUsers(), loadDirectory()]);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

function reloadUsers() {
  usersPage.value = 1;
  return loadUsers();
}

function resetUserFilters() {
  Object.assign(userFilters, { q: '', role: '', status: '' });
  reloadUsers();
}

function changeUsersPage(next) {
  usersPage.value = next;
  loadUsers();
}

function reloadApprovals() {
  approvalPage.value = 1;
  return loadApprovals();
}

function resetApprovalFilters() {
  Object.assign(approvalFilters, { q: '', status: '' });
  reloadApprovals();
}

function changeApprovalPage(next) {
  approvalPage.value = next;
  loadApprovals();
}

function openCreate() {
  Object.assign(form, {
    id: null, name: '', email: '', phone: '', role: 'salesperson', manager_id: null,
    position_id: null, status: 'active', password: '',
  });
  // 刷新员工目录与组织架构，确保刚新建的工程部经理等上级可选
  loadDirectory();
  loadOrg();
  dialog.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    id: row.id, name: row.name, email: row.email || '', phone: row.phone || '',
    role: row.role, manager_id: row.manager_id || null, position_id: row.position_id || null,
    status: row.status, password: '',
  });
  loadDirectory();
  loadOrg();
  dialog.value = true;
}

async function save() {
  if (!form.name) return ElMessage.warning(t('name'));
  if (!form.id && !form.email && !form.phone) return ElMessage.warning(`${t('email')} / ${t('phone')}`);
  if (!form.id && String(form.password).length < 8) return ElMessage.warning(t('password'));
  if (!form.position_id && MANAGER_ROLES_BY_ROLE[form.role] && !form.manager_id) {
    return ElMessage.warning(t('managerRequired'));
  }
  saving.value = true;
  try {
    const payload = {
      name: form.name, email: form.email, phone: form.phone, role: form.role,
      manager_id: form.manager_id || null, position_id: form.position_id || null, status: form.status,
    };
    if (form.password) payload.password = form.password;
    if (form.id) await patch(`/pv/api/admin/users/${form.id}`, payload);
    else await post('/pv/api/admin/users', payload);
    ElMessage.success(t('operationSuccess'));
    dialog.value = false;
    await Promise.all([reloadUsers(), loadDirectory(), loadOrg()]);
  } catch (error) {
    const alertKey = {
      email_exists: 'emailExists',
      phone_exists: 'phoneExists',
      email_or_phone_required: 'emailOrPhoneRequired',
      manager_required: 'managerRequired',
      invalid_manager_role: 'invalidManagerRole',
    }[error.code];
    if (alertKey) {
      ElMessageBox.alert(t(alertKey), t('reminder'), { type: 'warning', confirmButtonText: t('confirm') }).catch(() => {});
    } else {
      ElMessage.error(error.message);
    }
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
    await reloadApprovals();
  } catch (error) {
    if (error?.message && error.message !== 'cancel') ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadUsers(), loadApprovals(), loadDirectory(), loadOrg()]);
});
</script>
