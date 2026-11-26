<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post, patch, del } from '@/api/client';
import { ROLE_LABEL } from '@/utils/format';

const list = ref([]);
const total = ref(0);
const options = ref({ stores: [] });
const filters = reactive({ keyword: '', role: '', page: 1, page_size: 10 });
const loading = ref(false);
const dialog = ref(false);
const editingId = ref(null);
const form = reactive({ username: '', password: '', name: '', role: 'store_clerk', store_id: null, phone: '', email: '' });

const ROLES = Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }));
const needStore = (role) => ['store_manager', 'store_clerk'].includes(role);

async function load() {
  loading.value = true;
  try {
    const data = await get(`/auth/users?page=${filters.page}&page_size=${filters.page_size}&keyword=${encodeURIComponent(filters.keyword)}&role=${filters.role}`);
    list.value = data.items;
    total.value = data.total;
  } finally { loading.value = false; }
}
function openCreate() {
  Object.assign(form, { username: '', password: '', name: '', role: 'store_clerk', store_id: options.value.stores[0]?.id || null, phone: '', email: '' });
  editingId.value = null;
  dialog.value = true;
}
function openEdit(row) {
  Object.assign(form, { username: row.username, password: '', name: row.name, role: row.role, store_id: row.store_id, phone: row.phone, email: row.email });
  editingId.value = row.id;
  dialog.value = true;
}
async function save() {
  try {
    const payload = { ...form };
    if (editingId.value) {
      if (!payload.password) delete payload.password;
      delete payload.username;
      await patch(`/auth/users/${editingId.value}`, payload);
    } else {
      await post('/auth/users', payload);
    }
    ElMessage.success('已保存');
    dialog.value = false;
    await load();
  } catch (error) { ElMessage.error(error.message || '保存失败'); }
}
async function disable(row) {
  try {
    await ElMessageBox.confirm(`确认停用账号「${row.username}」？`, '提示', { type: 'warning' });
    await del(`/auth/users/${row.id}`);
    ElMessage.success('已停用');
    await load();
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.message); }
}

onMounted(async () => { options.value = await get('/master/options'); await load(); });
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-title">账号管理</div>
      <el-button type="primary" @click="openCreate">+ 新增账号</el-button>
    </div>
    <div class="filters">
      <el-input v-model="filters.keyword" placeholder="账号 / 姓名 / 电话" clearable style="width:220px" @keyup.enter="filters.page = 1; load()" />
      <el-select v-model="filters.role" placeholder="角色" clearable style="width:160px" @change="filters.page = 1; load()">
        <el-option v-for="role in ROLES" :key="role.value" :value="role.value" :label="role.label" />
      </el-select>
      <el-button @click="filters.page = 1; load()">查询</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border size="small">
      <el-table-column prop="username" label="账号" width="130" />
      <el-table-column prop="name" label="姓名" width="120" />
      <el-table-column label="角色" width="120"><template #default="{ row }">{{ ROLE_LABEL[row.role] || row.role }}</template></el-table-column>
      <el-table-column label="门店" width="140">
        <template #default="{ row }">{{ (options.stores.find((store) => store.id === row.store_id) || {}).name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="phone" label="电话" width="140" />
      <el-table-column prop="email" label="邮箱" min-width="180" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }"><el-tag size="small" :type="row.status === 'active' ? 'success' : 'danger'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" text type="danger" @click="disable(row)">停用</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="mt12" layout="total, prev, pager, next" :total="total" :page-size="filters.page_size"
      v-model:current-page="filters.page" @current-change="load" />

    <el-dialog v-model="dialog" :title="editingId ? '编辑账号' : '新增账号'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="账号" required><el-input v-model="form.username" :disabled="Boolean(editingId)" /></el-form-item>
        <el-form-item label="密码" :required="!editingId">
          <el-input v-model="form.password" type="password" show-password :placeholder="editingId ? '留空表示不修改' : '至少 6 位'" />
        </el-form-item>
        <el-form-item label="姓名" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width:100%">
            <el-option v-for="role in ROLES" :key="role.value" :value="role.value" :label="role.label" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="needStore(form.role)" label="所属门店" required>
          <el-select v-model="form.store_id" style="width:100%">
            <el-option v-for="store in options.stores" :key="store.id" :value="store.id" :label="store.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
