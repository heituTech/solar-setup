<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { get, post } from '@/api/client';
import { money, PAY_STATUS, paymentMethodLabel } from '@/utils/format';

const tab = ref('receivables');
const summary = ref({ outstanding_total: 0, overdue_count: 0, receipts_today: { amount: 0, count: 0 } });
const options = ref({ payment_methods: [] });
const receivables = reactive({ items: [], total: 0, page: 1, page_size: 10, status: '', overdue: '', keyword: '' });
const receipts = reactive({ items: [], total: 0, page: 1, page_size: 10, keyword: '' });
const loading = ref(false);

async function loadSummary() { summary.value = await get('/finance/summary'); }
async function loadReceivables() {
  loading.value = true;
  try {
    const data = await get(`/finance/receivables?page=${receivables.page}&page_size=${receivables.page_size}&status=${receivables.status}&overdue=${receivables.overdue}&keyword=${encodeURIComponent(receivables.keyword)}`);
    receivables.items = data.items;
    receivables.total = data.total;
  } finally { loading.value = false; }
}
async function loadReceipts() {
  loading.value = true;
  try {
    const data = await get(`/finance/receipts?page=${receipts.page}&page_size=${receipts.page_size}&keyword=${encodeURIComponent(receipts.keyword)}`);
    receipts.items = data.items;
    receipts.total = data.total;
  } finally { loading.value = false; }
}

const dialog = ref(false);
const form = reactive({ receivable_id: null, amount: 0, method: 'bank', received_at: '', remark: '' });
function openReceive(row) {
  form.receivable_id = row.id;
  form.amount = Number(row.amount) - Number(row.received_amount);
  form.method = 'bank';
  form.received_at = '';
  form.remark = '';
  dialog.value = true;
}
async function submit() {
  try {
    await post('/finance/receipts', { ...form, amount: Number(form.amount) });
    ElMessage.success('收款已核销');
    dialog.value = false;
    await Promise.all([loadReceivables(), loadReceipts(), loadSummary()]);
  } catch (error) { ElMessage.error(error.message); }
}

onMounted(async () => {
  options.value = await get('/master/options');
  await Promise.all([loadSummary(), loadReceivables(), loadReceipts()]);
});
</script>

<template>
  <div class="page">
    <div class="page-header"><div class="page-title">财务应收</div></div>
    <div class="cards">
      <el-card shadow="never"><div class="muted">待收款合计</div><div class="card-value" style="color:#e6a23c">{{ money(summary.outstanding_total) }}</div></el-card>
      <el-card shadow="never"><div class="muted">逾期笔数</div><div class="card-value" style="color:#f56c6c">{{ summary.overdue_count }}</div></el-card>
      <el-card shadow="never"><div class="muted">今日收款</div><div class="card-value" style="color:#67c23a">{{ money(summary.receipts_today.amount) }}</div></el-card>
      <el-card shadow="never"><div class="muted">今日笔数</div><div class="card-value">{{ summary.receipts_today.count }}</div></el-card>
    </div>

    <el-tabs v-model="tab" type="border-card">
      <el-tab-pane label="应收台账" name="receivables">
        <div class="filters">
          <el-input v-model="receivables.keyword" placeholder="项目编号 / 客户 / 款项" clearable style="width:240px" @keyup.enter="receivables.page = 1; loadReceivables()" />
          <el-select v-model="receivables.status" placeholder="状态" clearable style="width:130px" @change="receivables.page = 1; loadReceivables()">
            <el-option v-for="(label, value) in PAY_STATUS" :key="value" :label="label" :value="value" />
          </el-select>
          <el-checkbox v-model="receivables.overdue" true-value="1" false-value="" @change="receivables.page = 1; loadReceivables()">只看逾期</el-checkbox>
          <el-button @click="receivables.page = 1; loadReceivables()">查询</el-button>
        </div>
        <el-table :data="receivables.items" v-loading="loading" border size="small">
          <el-table-column prop="project_no" label="项目编号" width="150" />
          <el-table-column prop="customer_name" label="客户" min-width="120" />
          <el-table-column prop="name" label="应收项" width="110" />
          <el-table-column label="金额" width="130" align="right"><template #default="{ row }">{{ money(row.amount) }}</template></el-table-column>
          <el-table-column label="已收" width="130" align="right"><template #default="{ row }">{{ money(row.received_amount) }}</template></el-table-column>
          <el-table-column prop="due_date" label="到期日" width="120" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag size="small" :type="row.status === 'paid' ? 'success' : row.status === 'partial' ? 'warning' : 'info'">{{ PAY_STATUS[row.status] }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status !== 'paid'" size="small" text type="primary" @click="openReceive(row)">收款核销</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination class="mt12" layout="total, prev, pager, next" :total="receivables.total" :page-size="receivables.page_size"
          v-model:current-page="receivables.page" @current-change="loadReceivables" />
      </el-tab-pane>

      <el-tab-pane label="收款流水" name="receipts">
        <div class="filters">
          <el-input v-model="receipts.keyword" placeholder="收款单号 / 项目编号" clearable style="width:240px" @keyup.enter="receipts.page = 1; loadReceipts()" />
          <el-button @click="receipts.page = 1; loadReceipts()">查询</el-button>
        </div>
        <el-table :data="receipts.items" v-loading="loading" border size="small">
          <el-table-column prop="receipt_no" label="收款单号" width="170" />
          <el-table-column prop="project_no" label="项目编号" width="150" />
          <el-table-column prop="customer_name" label="客户" min-width="120" />
          <el-table-column label="金额" width="130" align="right"><template #default="{ row }">{{ money(row.amount) }}</template></el-table-column>
          <el-table-column label="方式" width="110"><template #default="{ row }">{{ paymentMethodLabel(row.method) }}</template></el-table-column>
          <el-table-column prop="received_at" label="收款日期" width="120" />
          <el-table-column prop="operator_name" label="经办人" width="100" />
          <el-table-column prop="remark" label="备注" min-width="160" />
        </el-table>
        <el-pagination class="mt12" layout="total, prev, pager, next" :total="receipts.total" :page-size="receipts.page_size"
          v-model:current-page="receipts.page" @current-change="loadReceipts" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="dialog" title="收款核销" width="480px">
      <el-form label-width="90px">
        <el-form-item label="收款金额"><el-input-number v-model="form.amount" :min="0.01" :precision="2" style="width:100%" /></el-form-item>
        <el-form-item label="收款方式">
          <el-select v-model="form.method" style="width:100%">
            <el-option v-for="item in options.payment_methods" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="收款日期"><el-input v-model="form.received_at" placeholder="2026-11-26" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submit">确认核销</el-button>
      </template>
    </el-dialog>
  </div>
</template>
