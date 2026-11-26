<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { money, ORDER_STATUS } from '@/utils/format';

const auth = useAuthStore();
const list = ref([]);
const total = ref(0);
const loading = ref(false);
const options = ref({ products: [], payment_methods: [] });
const filters = reactive({ keyword: '', status: '', page: 1, page_size: 10 });
const dialog = ref(false);
const detailDialog = ref(false);
const detail = ref(null);
const saving = ref(false);
const form = reactive({
  customer_name: '', customer_phone: '', customer_address: '', capacity_kw: 0,
  items: [], deposit_amount: 0, deposit_method: 'bank', remark: '',
});

const orderTotal = computed(() => form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0));

function productOf(id) { return options.value.products.find((product) => product.id === id); }

async function load() {
  loading.value = true;
  try {
    const data = await get(`/sales/orders?page=${filters.page}&page_size=${filters.page_size}&keyword=${encodeURIComponent(filters.keyword)}&status=${filters.status}`);
    list.value = data.items;
    total.value = data.total;
  } finally { loading.value = false; }
}

async function loadOptions() {
  options.value = await get('/master/options');
}

function openCreate() {
  Object.assign(form, {
    customer_name: '', customer_phone: '', customer_address: '', capacity_kw: 0,
    items: [{ product_id: null, qty: 1, unit_price: 0 }],
    deposit_amount: 0, deposit_method: 'bank', remark: '',
  });
  dialog.value = true;
}

function addLine() { form.items.push({ product_id: null, qty: 1, unit_price: 0 }); }
function removeLine(index) { form.items.splice(index, 1); }
function onProductChange(line) {
  const product = productOf(line.product_id);
  if (product) line.unit_price = Number(product.sale_price);
}

async function submit() {
  if (!form.customer_name) return ElMessage.warning('请填写客户姓名');
  const items = form.items.filter((item) => item.product_id && Number(item.qty) > 0);
  if (!items.length) return ElMessage.warning('请至少添加一项产品');
  saving.value = true;
  try {
    const data = await post('/sales/orders', { ...form, items });
    dialog.value = false;
    await load();
    ElMessageBox.alert(`销售单 ${data.order_no} 已创建，已生成项目工单 ${data.project_no}`, '开单成功', { type: 'success' });
  } catch (error) {
    ElMessage.error(error.message || '开单失败');
  } finally { saving.value = false; }
}

async function openDetail(row) {
  detail.value = await get(`/sales/orders/${row.id}`);
  detailDialog.value = true;
}

async function confirmOrder(row) {
  try {
    await post(`/sales/orders/${row.id}/confirm`);
    ElMessage.success('已确认');
    load();
  } catch (error) { ElMessage.error(error.message); }
}
async function cancelOrder(row) {
  try {
    await ElMessageBox.confirm('确认作废该销售单？', '提示', { type: 'warning' });
    await post(`/sales/orders/${row.id}/cancel`);
    ElMessage.success('已作废');
    load();
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.message); }
}

onMounted(async () => { await loadOptions(); await load(); });
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-title">门店销售</div>
      <el-button type="primary" @click="openCreate">+ 开单</el-button>
    </div>
    <div class="filters">
      <el-input v-model="filters.keyword" placeholder="单号 / 客户 / 电话" clearable style="width:220px" @keyup.enter="filters.page = 1; load()" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width:140px" @change="filters.page = 1; load()">
        <el-option v-for="(label, value) in ORDER_STATUS" :key="value" :label="label" :value="value" />
      </el-select>
      <el-button @click="filters.page = 1; load()">查询</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="order_no" label="销售单号" width="170" />
      <el-table-column prop="customer_name" label="客户" min-width="130" />
      <el-table-column prop="customer_phone" label="电话" width="130" />
      <el-table-column label="金额" width="130" align="right">
        <template #default="{ row }">{{ money(row.total_amount) }}</template>
      </el-table-column>
      <el-table-column label="定金" width="110" align="right">
        <template #default="{ row }">{{ money(row.deposit_amount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'cancelled' ? 'danger' : row.status === 'confirmed' ? 'success' : 'info'">
            {{ ORDER_STATUS[row.status] || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="project_no" label="项目工单" width="160" />
      <el-table-column prop="store_name" label="门店" width="130" />
      <el-table-column prop="created_by_name" label="开单人" width="100" />
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button size="small" text type="primary" @click="openDetail(row)">详情</el-button>
            <el-button v-if="auth.isManager && row.status === 'draft'" size="small" text type="success" @click="confirmOrder(row)">确认</el-button>
            <el-button v-if="auth.isManager && row.status === 'draft'" size="small" text type="danger" @click="cancelOrder(row)">作废</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination class="mt12" layout="total, prev, pager, next" :total="total" :page-size="filters.page_size"
      v-model:current-page="filters.page" @current-change="load" />

    <el-dialog v-model="dialog" title="门店开单（POS）" width="860px">
      <el-form label-width="90px">
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="客户姓名"><el-input v-model="form.customer_name" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="联系电话"><el-input v-model="form.customer_phone" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="装机容量"><el-input-number v-model="form.capacity_kw" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="安装地址"><el-input v-model="form.customer_address" /></el-form-item>
        <el-form-item label="产品明细">
          <div style="width:100%">
            <div v-for="(line, index) in form.items" :key="index" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
              <el-select v-model="line.product_id" placeholder="选择产品" style="flex:1" @change="onProductChange(line)">
                <el-option v-for="product in options.products" :key="product.id" :value="product.id"
                  :label="`${product.code} ${product.name}（${product.unit}）`" />
              </el-select>
              <el-input-number v-model="line.qty" :min="0.001" :precision="3" style="width:120px" />
              <el-input-number v-model="line.unit_price" :min="0" :precision="2" style="width:140px" />
              <span style="width:110px;text-align:right">{{ money(Number(line.qty) * Number(line.unit_price)) }}</span>
              <el-button text type="danger" @click="removeLine(index)">删除</el-button>
            </div>
            <el-button text type="primary" @click="addLine">+ 添加一行</el-button>
          </div>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="定金"><el-input-number v-model="form.deposit_amount" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="收款方式">
              <el-select v-model="form.deposit_method" style="width:100%">
                <el-option v-for="item in options.payment_methods" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8"><el-form-item label="订单合计"><b>{{ money(orderTotal) }}</b></el-form-item></el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">提交并生成项目工单</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialog" title="销售单详情" width="700px">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="单号">{{ detail.order_no }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ ORDER_STATUS[detail.status] }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ detail.customer_name }}</el-descriptions-item>
          <el-descriptions-item label="电话">{{ detail.customer_phone }}</el-descriptions-item>
          <el-descriptions-item label="地址" :span="2">{{ detail.customer_address }}</el-descriptions-item>
          <el-descriptions-item label="合计">{{ money(detail.total_amount) }}</el-descriptions-item>
          <el-descriptions-item label="已收">{{ money(detail.paid_amount) }}</el-descriptions-item>
          <el-descriptions-item label="关联项目">{{ detail.project?.project_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ detail.remark }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="detail.items" class="mt12" border size="small">
          <el-table-column prop="product_code" label="编码" width="100" />
          <el-table-column prop="product_name" label="产品" min-width="160" />
          <el-table-column prop="qty" label="数量" width="90" />
          <el-table-column prop="unit_price" label="单价" width="100" />
          <el-table-column prop="amount" label="金额" width="110" />
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>
