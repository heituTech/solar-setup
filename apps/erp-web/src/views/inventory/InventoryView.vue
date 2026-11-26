<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { get, post } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { money, ISSUE_STATUS } from '@/utils/format';

const auth = useAuthStore();
const tab = ref('stocks');
const options = ref({ stores: [], products: [] });
const stocks = reactive({ items: [], total: 0, page: 1, page_size: 10, keyword: '', store_id: null, low: '' });
const issues = reactive({ items: [], total: 0, page: 1, page_size: 10, status: '', keyword: '' });
const movements = reactive({ items: [], total: 0, page: 1, page_size: 10, type: '' });
const lowItems = ref([]);
const loading = ref(false);

async function loadStocks() {
  loading.value = true;
  try {
    const query = `page=${stocks.page}&page_size=${stocks.page_size}&keyword=${encodeURIComponent(stocks.keyword)}&store_id=${stocks.store_id || ''}&low=${stocks.low}`;
    const data = await get(`/inventory/stocks?${query}`);
    stocks.items = data.items;
    stocks.total = data.total;
  } finally { loading.value = false; }
}
async function loadIssues() {
  loading.value = true;
  try {
    const data = await get(`/inventory/issues?page=${issues.page}&page_size=${issues.page_size}&status=${issues.status}&keyword=${encodeURIComponent(issues.keyword)}`);
    issues.items = data.items;
    issues.total = data.total;
  } finally { loading.value = false; }
}
async function loadMovements() {
  loading.value = true;
  try {
    const data = await get(`/inventory/movements?page=${movements.page}&page_size=${movements.page_size}&type=${movements.type}`);
    movements.items = data.items;
    movements.total = data.total;
  } finally { loading.value = false; }
}
async function loadLow() { lowItems.value = (await get('/inventory/low-stock')).items; }

const adjustDialog = ref(false);
const adjustForm = reactive({ store_id: null, product_id: null, mode: 'in', qty: 1, cost_price: 0, safety_qty: 0, remark: '' });
function openAdjust(row) {
  adjustForm.store_id = row ? row.store_id : (options.value.stores[0]?.id || null);
  adjustForm.product_id = row ? row.product_id : null;
  adjustForm.mode = 'in';
  adjustForm.qty = row ? 1 : 1;
  adjustForm.cost_price = row ? Number(row.cost_price) : 0;
  adjustForm.safety_qty = row ? Number(row.safety_qty) : 0;
  adjustForm.remark = '';
  adjustDialog.value = true;
}
async function submitAdjust() {
  try {
    await post('/inventory/stocks/adjust', adjustForm);
    ElMessage.success('库存已更新');
    adjustDialog.value = false;
    await Promise.all([loadStocks(), loadLow()]);
  } catch (error) { ElMessage.error(error.message); }
}
async function act(path, text) {
  try {
    await post(path);
    ElMessage.success(text);
    await Promise.all([loadIssues(), loadStocks()]);
  } catch (error) { ElMessage.error(error.message); }
}

onMounted(async () => {
  options.value = await get('/master/options');
  await Promise.all([loadStocks(), loadIssues(), loadLow()]);
});
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-title">库存领料</div>
      <el-button v-if="auth.isManager" type="primary" @click="openAdjust(null)">+ 入库 / 盘点</el-button>
    </div>
    <el-tabs v-model="tab" type="border-card">
      <el-tab-pane label="门店库存" name="stocks">
        <div class="filters">
          <el-input v-model="stocks.keyword" placeholder="产品编码 / 名称" clearable style="width:220px" @keyup.enter="stocks.page = 1; loadStocks()" />
          <el-select v-model="stocks.store_id" placeholder="门店" clearable style="width:160px" @change="stocks.page = 1; loadStocks()">
            <el-option v-for="store in options.stores" :key="store.id" :value="store.id" :label="store.name" />
          </el-select>
          <el-checkbox v-model="stocks.low" true-value="1" false-value="" @change="stocks.page = 1; loadStocks()">只看低库存</el-checkbox>
        </div>
        <el-table :data="stocks.items" v-loading="loading" border size="small">
          <el-table-column prop="product_code" label="编码" width="100" />
          <el-table-column prop="product_name" label="产品" min-width="180" />
          <el-table-column prop="store_name" label="门店" width="130" />
          <el-table-column prop="qty" label="库存" width="100" />
          <el-table-column prop="unit" label="单位" width="70" />
          <el-table-column prop="safety_qty" label="安全库存" width="100" />
          <el-table-column label="单位成本" width="110" align="right"><template #default="{ row }">{{ money(row.cost_price) }}</template></el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="Number(row.qty) <= Number(row.safety_qty) ? 'danger' : 'success'">
                {{ Number(row.qty) <= Number(row.safety_qty) ? '预警' : '正常' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110">
            <template #default="{ row }">
              <el-button v-if="auth.isManager" size="small" text type="primary" @click="openAdjust(row)">调整</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination class="mt12" layout="total, prev, pager, next" :total="stocks.total" :page-size="stocks.page_size"
          v-model:current-page="stocks.page" @current-change="loadStocks" />
      </el-tab-pane>

      <el-tab-pane label="领料单" name="issues">
        <div class="filters">
          <el-input v-model="issues.keyword" placeholder="领料单号 / 项目编号" clearable style="width:220px" @keyup.enter="issues.page = 1; loadIssues()" />
          <el-select v-model="issues.status" placeholder="状态" clearable style="width:130px" @change="issues.page = 1; loadIssues()">
            <el-option v-for="(label, value) in ISSUE_STATUS" :key="value" :label="label" :value="value" />
          </el-select>
          <el-button @click="issues.page = 1; loadIssues()">查询</el-button>
        </div>
        <el-table :data="issues.items" v-loading="loading" border size="small">
          <el-table-column prop="issue_no" label="领料单号" width="170" />
          <el-table-column prop="project_no" label="项目编号" width="150" />
          <el-table-column prop="customer_name" label="客户" min-width="120" />
          <el-table-column label="成本" width="120" align="right"><template #default="{ row }">{{ money(row.total_cost) }}</template></el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" :type="row.status === 'issued' ? 'success' : row.status === 'approved' ? 'primary' : 'info'">{{ ISSUE_STATUS[row.status] }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="requested_by_name" label="申请人" width="100" />
          <el-table-column label="操作" width="160">
            <template #default="{ row }">
              <el-button v-if="auth.isManager && row.status === 'draft'" size="small" text type="primary" @click="act(`/inventory/issues/${row.id}/approve`, '已审批')">审批</el-button>
              <el-button v-if="auth.isManager && row.status === 'approved'" size="small" text type="success" @click="act(`/inventory/issues/${row.id}/out`, '已出库')">出库</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination class="mt12" layout="total, prev, pager, next" :total="issues.total" :page-size="issues.page_size"
          v-model:current-page="issues.page" @current-change="loadIssues" />
      </el-tab-pane>

      <el-tab-pane label="库存预警" name="low">
        <el-table :data="lowItems" border size="small">
          <el-table-column prop="product_name" label="产品" min-width="180" />
          <el-table-column prop="store_name" label="门店" width="140" />
          <el-table-column prop="qty" label="当前库存" width="110" />
          <el-table-column prop="safety_qty" label="安全库存" width="110" />
          <el-table-column prop="unit" label="单位" width="80" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane v-if="auth.isManager" label="出入库流水" name="movements">
        <div class="filters">
          <el-select v-model="movements.type" placeholder="类型" clearable style="width:140px" @change="movements.page = 1; loadMovements()">
            <el-option label="入库" value="in" /><el-option label="出库" value="out" />
            <el-option label="退回" value="return" /><el-option label="盘点" value="adjust" />
          </el-select>
          <el-button @click="movements.page = 1; loadMovements()">查询</el-button>
        </div>
        <el-table v-if="movements.items.length || loading" :data="movements.items" v-loading="loading" border size="small">
          <el-table-column prop="created_at" label="时间" width="170" />
          <el-table-column prop="product_name" label="产品" min-width="160" />
          <el-table-column prop="type" label="类型" width="80" />
          <el-table-column prop="qty" label="数量" width="100" />
          <el-table-column prop="before_qty" label="变更前" width="100" />
          <el-table-column prop="after_qty" label="变更后" width="100" />
          <el-table-column label="金额" width="110" align="right"><template #default="{ row }">{{ money(row.amount) }}</template></el-table-column>
          <el-table-column prop="operator_name" label="操作人" width="100" />
          <el-table-column prop="remark" label="备注" min-width="180" />
        </el-table>
        <el-button v-else @click="loadMovements">加载流水</el-button>
        <el-pagination class="mt12" layout="total, prev, pager, next" :total="movements.total" :page-size="movements.page_size"
          v-model:current-page="movements.page" @current-change="loadMovements" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="adjustDialog" title="入库 / 盘点" width="500px">
      <el-form label-width="100px">
        <el-form-item label="门店">
          <el-select v-model="adjustForm.store_id" style="width:100%">
            <el-option v-for="store in options.stores" :key="store.id" :value="store.id" :label="store.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品">
          <el-select v-model="adjustForm.product_id" filterable style="width:100%">
            <el-option v-for="product in options.products" :key="product.id" :value="product.id" :label="`${product.code} ${product.name}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="方式">
          <el-radio-group v-model="adjustForm.mode">
            <el-radio value="in">入库</el-radio>
            <el-radio value="set">盘点（设为）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="数量"><el-input-number v-model="adjustForm.qty" :min="0.001" :precision="3" style="width:100%" /></el-form-item>
        <el-form-item label="单位成本"><el-input-number v-model="adjustForm.cost_price" :min="0" :precision="2" style="width:100%" /></el-form-item>
        <el-form-item label="安全库存"><el-input-number v-model="adjustForm.safety_qty" :min="0" :precision="3" style="width:100%" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="adjustForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustDialog = false">取消</el-button>
        <el-button type="primary" @click="submitAdjust">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
