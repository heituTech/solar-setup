<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post, fileUrl } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import FileUploader from '@/components/FileUploader.vue';
import {
  money, STAGE_LABEL, STAGE_TYPE, QUOTE_STATUS, ISSUE_STATUS, PAY_STATUS, paymentMethodLabel,
} from '@/utils/format';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const id = Number(route.params.id);
const detail = ref(null);
const options = ref({ engineers: [], crews: [], products: [], payment_methods: [] });
const loading = ref(false);
const tab = ref('overview');

const project = computed(() => detail.value?.project || {});
const survey = computed(() => detail.value?.survey || null);
const quotes = computed(() => detail.value?.quotes || []);
const contract = computed(() => detail.value?.contract || null);
const plans = computed(() => detail.value?.payment_plans || []);
const construction = computed(() => detail.value?.construction || null);
const logs = computed(() => detail.value?.construction_logs || []);
const acceptance = computed(() => detail.value?.acceptance || null);
const warranty = computed(() => detail.value?.warranty || null);
const finance = computed(() => detail.value?.finance || { receivables: [], receipts: [], costs: [], totals: {} });
const issues = computed(() => detail.value?.issues || []);
const files = computed(() => detail.value?.files || []);
const audits = computed(() => detail.value?.audits || []);

const canSurvey = computed(() => ['admin', 'store_manager', 'store_clerk', 'electrical_engineer', 'structural_engineer'].includes(auth.role));
const canSell = computed(() => auth.canSell);
const canManage = computed(() => auth.isManager);
const canConstruct = computed(() => ['admin', 'construction_captain'].includes(auth.role));

async function load() {
  loading.value = true;
  try {
    detail.value = await get(`/project/projects/${id}`);
  } catch (error) {
    ElMessage.error(error.code === 'project_forbidden' ? '无权查看该项目' : (error.message || '加载失败'));
    router.replace('/projects');
  } finally { loading.value = false; }
}
async function loadOptions() { options.value = await get('/master/options'); }

async function act(path, payload, successText) {
  try {
    await post(path, payload);
    ElMessage.success(successText || '操作成功');
    await load();
  } catch (error) {
    ElMessage.error(error.message || '操作失败');
  }
}

// ---------------- 勘测 ----------------
const surveyForm = reactive({
  engineer_id: null, survey_date: '', roof_type: '彩钢瓦', roof_area: 0, roof_condition: '',
  grid_phase: '三相', meter_no: '', remarks: '', photo_ids: [],
});
function resetSurveyForm() {
  if (survey.value) {
    Object.assign(surveyForm, {
      engineer_id: survey.value.engineer_id || null, survey_date: survey.value.survey_date || '',
      roof_type: survey.value.roof_type || '彩钢瓦', roof_area: Number(survey.value.roof_area || 0),
      roof_condition: survey.value.roof_condition || '', grid_phase: survey.value.grid_phase || '三相',
      meter_no: survey.value.meter_no || '', remarks: survey.value.remarks || '',
      photo_ids: survey.value.photo_ids ? JSON.parse(survey.value.photo_ids) : [],
    });
  }
}
async function saveSurvey() {
  const payload = { ...surveyForm };
  if (auth.role === 'electrical_engineer' || auth.role === 'structural_engineer') delete payload.engineer_id;
  await act(`/project/projects/${id}/survey`, payload, '勘测信息已保存');
}
function onSurveyPhoto(file) { surveyForm.photo_ids.push(file.id); }

// ---------------- 报价 ----------------
const quoteDialog = ref(false);
const quoteForm = reactive({ items: [], discount_amount: 0, remark: '' });
function openQuote() {
  quoteForm.items = [{ name: '', spec: '', unit: 'pcs', qty: 1, unit_price: 0 }];
  quoteForm.discount_amount = 0;
  quoteForm.remark = '';
  quoteDialog.value = true;
}
const quoteTotal = computed(() => quoteForm.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0));
async function submitQuote() {
  const items = quoteForm.items.filter((item) => item.name && Number(item.qty) > 0);
  if (!items.length) return ElMessage.warning('请填写报价明细');
  await act(`/project/projects/${id}/quotes`, { items, discount_amount: quoteForm.discount_amount, remark: quoteForm.remark }, '报价已提交审批');
  quoteDialog.value = false;
}

// ---------------- 合同 ----------------
const contractForm = reactive({ amount: 0, deposit_ratio: 30, signed_at: '', file_id: null });
async function signContract() {
  if (!contractForm.amount) return ElMessage.warning('请填写合同金额');
  await act(`/project/projects/${id}/contract`, { ...contractForm, amount: Number(contractForm.amount) }, '合同已签订，收款计划已生成');
  contractForm.file_id = null;
}
function onContractFile(file) { contractForm.file_id = file.id; ElMessage.success('合同文件已上传，可签订'); }

// ---------------- 收款 ----------------
const receiveDialog = ref(false);
const receiveForm = reactive({ receivable_id: null, amount: 0, method: 'bank', received_at: '', remark: '' });
function openReceive(row) {
  receiveForm.receivable_id = row.id;
  receiveForm.amount = Number(row.amount) - Number(row.received_amount);
  receiveForm.method = 'bank';
  receiveForm.received_at = '';
  receiveForm.remark = '';
  receiveDialog.value = true;
}
async function submitReceive() {
  await act('/finance/receipts', { ...receiveForm, amount: Number(receiveForm.amount) }, '收款已核销');
  receiveDialog.value = false;
}

// ---------------- 领料 ----------------
const issueDialog = ref(false);
const issueForm = reactive({ items: [], remark: '' });
function openIssue() { issueForm.items = [{ product_id: null, qty: 1 }]; issueForm.remark = ''; issueDialog.value = true; }
async function submitIssue() {
  const items = issueForm.items.filter((item) => item.product_id && Number(item.qty) > 0);
  if (!items.length) return ElMessage.warning('请选择领料产品');
  await act('/inventory/issues', { project_id: id, items, remark: issueForm.remark }, '领料申请已提交');
  issueDialog.value = false;
}
const returnDialog = ref(false);
const returnForm = reactive({ issue: null, items: [], remark: '' });
function openReturn(issue) {
  returnForm.issue = issue;
  returnForm.items = (issue.items || []).map((line) => ({ product_id: line.product_id, product_name: line.product_name, qty: 0, max: Number(line.qty) }));
  returnForm.remark = '';
  returnDialog.value = true;
}
async function submitReturn() {
  const items = returnForm.items.filter((item) => Number(item.qty) > 0);
  if (!items.length) return ElMessage.warning('请填写退回数量');
  await act(`/inventory/issues/${returnForm.issue.id}/return`, { items, remark: returnForm.remark }, '余料已退回');
  returnDialog.value = false;
}

// ---------------- 施工 ----------------
const constructionForm = reactive({ crew_id: null, captain_user_id: null, start_date: '' });
async function startConstruction() {
  if (!constructionForm.crew_id && !constructionForm.captain_user_id) return ElMessage.warning('请选择施工班组或队长');
  await act(`/project/projects/${id}/construction`, { ...constructionForm }, '已指派施工');
}
const logForm = reactive({ content: '', progress: 0, log_date: '' });
async function addLog() {
  if (!logForm.content) return ElMessage.warning('请填写施工日志');
  await act(`/project/projects/${id}/construction/logs`, { ...logForm, progress: Number(logForm.progress) }, '施工日志已提交');
  logForm.content = ''; logForm.progress = 0;
}
async function completeConstruction() {
  try {
    await ElMessageBox.confirm('确认施工已完成？', '提示', { type: 'warning' });
    await act(`/project/projects/${id}/construction/complete`, {}, '施工已完成');
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.message); }
}

// ---------------- 验收 ----------------
const acceptanceForm = reactive({ result: 'passed', grid_status: 'pending', grid_connection_no: '', remark: '', doc_ids: [] });
async function submitAcceptance() {
  await act(`/project/projects/${id}/acceptance`, { ...acceptanceForm }, '验收信息已提交');
}
function onAcceptanceDoc(file) { acceptanceForm.doc_ids.push(file.id); }

function onIssueCreated() { load(); }

onMounted(async () => { await loadOptions(); await load(); resetSurveyForm(); });
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-header">
      <el-button text @click="router.push('/projects')">← 返回列表</el-button>
      <div style="flex:1"></div>
      <el-tag v-if="detail" :type="STAGE_TYPE[project.status]" size="large">{{ STAGE_LABEL[project.status] }}</el-tag>
    </div>

    <template v-if="detail">
      <div class="detail-head">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="font-size:18px;font-weight:600">{{ project.project_no }}</div>
          <div>{{ project.customer_name }}</div>
          <div class="muted">{{ project.customer_phone }}</div>
          <div class="muted">{{ project.customer_address }}</div>
        </div>
        <div class="muted mt8">
          门店：{{ project.store_name }}｜销售：{{ project.sales_user_name || '-' }}｜勘测：{{ project.surveyor_name || '-' }}｜
          队长：{{ project.captain_name || '-' }}｜合同金额：{{ money(project.contract_amount) }}
        </div>
      </div>

      <el-tabs v-model="tab" type="border-card">
        <el-tab-pane label="概览" name="overview">
          <div class="cards">
            <el-card shadow="never"><div class="muted">应收</div><div class="card-value">{{ money(finance.totals.receivable) }}</div></el-card>
            <el-card shadow="never"><div class="muted">已收</div><div class="card-value" style="color:#67c23a">{{ money(finance.totals.received) }}</div></el-card>
            <el-card shadow="never"><div class="muted">待收</div><div class="card-value" style="color:#e6a23c">{{ money(finance.totals.outstanding) }}</div></el-card>
            <el-card shadow="never"><div class="muted">项目成本</div><div class="card-value">{{ money(finance.totals.cost) }}</div></el-card>
            <el-card shadow="never"><div class="muted">毛利</div><div class="card-value" :style="{ color: finance.totals.profit >= 0 ? '#67c23a' : '#f56c6c' }">{{ money(finance.totals.profit) }}</div></el-card>
          </div>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="项目编号">{{ project.project_no }}</el-descriptions-item>
            <el-descriptions-item label="系统类型">{{ project.system_type }}</el-descriptions-item>
            <el-descriptions-item label="客户">{{ project.customer_name }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ project.customer_phone }}</el-descriptions-item>
            <el-descriptions-item label="安装地址" :span="2">{{ project.customer_address }}</el-descriptions-item>
            <el-descriptions-item label="装机容量">{{ project.capacity_kw }} kW</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ project.created_at }}</el-descriptions-item>
          </el-descriptions>

          <el-card class="mt12" shadow="never">
            <template #header>项目文件</template>
            <div v-if="!files.length" class="muted">暂无文件</div>
            <div v-for="file in files" :key="file.id" style="padding:4px 0">
              <a :href="fileUrl(file.id)" target="_blank">{{ file.filename }}</a>
              <span class="muted"> · {{ file.biz_type }} · {{ file.uploaded_by_name }}</span>
            </div>
          </el-card>
        </el-tab-pane>

        <el-tab-pane label="勘测" name="survey">
          <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px"
            title="工程师录入现场勘测信息并上传照片，提交后进入方案报价环节。" />
          <el-form label-width="110px" style="max-width:720px">
            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item label="勘测工程师">
                  <el-select v-model="surveyForm.engineer_id" style="width:100%" :disabled="auth.role !== 'admin' && auth.role !== 'store_manager' && auth.role !== 'store_clerk'">
                    <el-option v-for="engineer in options.engineers" :key="engineer.id" :value="engineer.id"
                      :label="`${engineer.name}（${engineer.type === 'electrical' ? '电气' : '结构'}）`" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12"><el-form-item label="勘测日期"><el-input v-model="surveyForm.survey_date" placeholder="2026-11-26" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="屋顶类型"><el-input v-model="surveyForm.roof_type" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="屋顶面积㎡"><el-input-number v-model="surveyForm.roof_area" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="并网相数"><el-input v-model="surveyForm.grid_phase" /></el-form-item></el-col>
              <el-col :span="12"><el-form-item label="电表编号"><el-input v-model="surveyForm.meter_no" /></el-form-item></el-col>
            </el-row>
            <el-form-item label="屋顶状况"><el-input v-model="surveyForm.roof_condition" /></el-form-item>
            <el-form-item label="备注"><el-input v-model="surveyForm.remarks" type="textarea" :rows="2" /></el-form-item>
            <el-form-item label="现场照片">
              <div>
                <FileUploader biz-type="survey" :biz-id="survey ? survey.id : 0" accept="image/*" button-text="上传现场照片" @uploaded="onSurveyPhoto" />
                <span class="muted" style="margin-left:8px">已关联 {{ surveyForm.photo_ids.length }} 张</span>
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :disabled="!canSurvey" @click="saveSurvey">保存勘测</el-button>
              <el-button v-if="survey && survey.status === 'draft'" :disabled="!canSurvey" @click="act(`/project/projects/${id}/survey/submit`, {}, '勘测已提交')">提交勘测</el-button>
              <el-tag v-if="survey" style="margin-left:8px" :type="survey.status === 'submitted' ? 'success' : 'info'">
                {{ survey.status === 'submitted' ? '已提交' : '草稿' }}
              </el-tag>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="方案报价" name="quote">
          <div class="page-header">
            <div class="muted">报价提交后由店长审批，审批通过后才能签订合同。</div>
            <el-button type="primary" size="small" :disabled="!canSell" @click="openQuote">+ 新建报价</el-button>
          </div>
          <el-table :data="quotes" border size="small">
            <el-table-column prop="quote_no" label="报价单号" width="160" />
            <el-table-column prop="version" label="版本" width="70" />
            <el-table-column label="总价" width="120" align="right"><template #default="{ row }">{{ money(row.total_amount) }}</template></el-table-column>
            <el-table-column label="优惠" width="110" align="right"><template #default="{ row }">{{ money(row.discount_amount) }}</template></el-table-column>
            <el-table-column label="最终价" width="130" align="right"><template #default="{ row }">{{ money(row.final_amount) }}</template></el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'">
                  {{ QUOTE_STATUS[row.status] || row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="明细" min-width="220">
              <template #default="{ row }">
                <div v-for="(item, index) in JSON.parse(row.items)" :key="index" class="muted">
                  {{ item.name }} × {{ item.qty }} = {{ money(item.amount) }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button v-if="canManage && row.status === 'pending'" size="small" text type="success"
                  @click="act(`/project/projects/${id}/quotes/${row.id}/approve`, {}, '报价已审批')">审批</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="合同与收款" name="contract">
          <template v-if="!contract">
            <el-alert type="warning" :closable="false" show-icon style="margin-bottom:12px"
              title="报价审批通过后签订线上合同，系统自动生成定金 / 进度款 / 尾款收款计划。" />
            <el-form label-width="110px" style="max-width:560px">
              <el-form-item label="合同金额"><el-input-number v-model="contractForm.amount" :min="0" :precision="2" style="width:100%" /></el-form-item>
              <el-form-item label="定金比例%"><el-input-number v-model="contractForm.deposit_ratio" :min="1" :max="99" style="width:100%" /></el-form-item>
              <el-form-item label="签订日期"><el-input v-model="contractForm.signed_at" placeholder="2026-11-26" /></el-form-item>
              <el-form-item label="合同 PDF">
                <FileUploader biz-type="contract" :biz-id="id" accept="application/pdf,image/*" button-text="上传合同文件" @uploaded="onContractFile" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :disabled="!canManage" @click="signContract">签订合同</el-button>
              </el-form-item>
            </el-form>
          </template>
          <template v-else>
            <el-descriptions :column="3" border>
              <el-descriptions-item label="合同编号">{{ contract.contract_no }}</el-descriptions-item>
              <el-descriptions-item label="金额">{{ money(contract.amount) }}</el-descriptions-item>
              <el-descriptions-item label="定金比例">{{ contract.deposit_ratio }}%</el-descriptions-item>
              <el-descriptions-item label="签订日期">{{ contract.signed_at }}</el-descriptions-item>
              <el-descriptions-item label="状态">{{ contract.status }}</el-descriptions-item>
              <el-descriptions-item label="合同文件">
                <a v-if="contract.file_id" :href="fileUrl(contract.file_id)" target="_blank">查看</a>
                <span v-else class="muted">未上传</span>
              </el-descriptions-item>
            </el-descriptions>

            <h4 class="mt12">收款计划</h4>
            <el-table :data="plans" border size="small">
              <el-table-column prop="seq" label="#" width="50" />
              <el-table-column prop="name" label="款项" width="100" />
              <el-table-column prop="ratio" label="比例%" width="90" />
              <el-table-column label="金额" width="130" align="right"><template #default="{ row }">{{ money(row.amount) }}</template></el-table-column>
              <el-table-column prop="due_date" label="到期日" width="120" />
              <el-table-column prop="received_amount" label="已收" width="120" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }"><el-tag size="small" :type="row.status === 'paid' ? 'success' : 'warning'">{{ PAY_STATUS[row.status] }}</el-tag></template>
              </el-table-column>
            </el-table>

            <h4 class="mt12">应收与核销</h4>
            <el-table :data="finance.receivables" border size="small">
              <el-table-column prop="name" label="应收项" width="120" />
              <el-table-column label="金额" width="130" align="right"><template #default="{ row }">{{ money(row.amount) }}</template></el-table-column>
              <el-table-column label="已收" width="130" align="right"><template #default="{ row }">{{ money(row.received_amount) }}</template></el-table-column>
              <el-table-column prop="due_date" label="到期日" width="120" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }"><el-tag size="small" :type="row.status === 'paid' ? 'success' : row.status === 'partial' ? 'warning' : 'info'">{{ PAY_STATUS[row.status] }}</el-tag></template>
              </el-table-column>
              <el-table-column label="操作" width="110" fixed="right">
                <template #default="{ row }">
                  <el-button v-if="canManage && row.status !== 'paid'" size="small" text type="primary" @click="openReceive(row)">收款核销</el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </el-tab-pane>

        <el-tab-pane label="领料" name="issue">
          <div class="page-header">
            <div class="muted">领料单审批后出库扣减门店库存，并自动归集到项目成本。</div>
            <el-button type="primary" size="small" :disabled="!canSell" @click="openIssue">+ 新建领料单</el-button>
          </div>
          <el-table :data="issues" border size="small">
            <el-table-column prop="issue_no" label="领料单号" width="170" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><el-tag size="small" :type="row.status === 'issued' ? 'success' : row.status === 'approved' ? 'primary' : 'info'">{{ ISSUE_STATUS[row.status] }}</el-tag></template>
            </el-table-column>
            <el-table-column label="成本" width="120" align="right"><template #default="{ row }">{{ money(row.total_cost) }}</template></el-table-column>
            <el-table-column label="明细" min-width="240">
              <template #default="{ row }">
                <div v-for="line in row.items" :key="line.id" class="muted">{{ line.product_name }} × {{ line.qty }}{{ line.unit }}</div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="220" fixed="right">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button v-if="canManage && row.status === 'draft'" size="small" text type="primary" @click="act(`/inventory/issues/${row.id}/approve`, {}, '领料已审批')">审批</el-button>
                  <el-button v-if="canManage && row.status === 'approved'" size="small" text type="success" @click="act(`/inventory/issues/${row.id}/out`, {}, '已出库')">出库</el-button>
                  <el-button v-if="canManage && row.status === 'issued'" size="small" text type="warning" @click="openReturn(row)">余料退回</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="施工" name="construction">
          <template v-if="!construction">
            <el-form label-width="110px" style="max-width:560px">
              <el-form-item label="施工班组">
                <el-select v-model="constructionForm.crew_id" style="width:100%" clearable>
                  <el-option v-for="crew in options.crews" :key="crew.id" :value="crew.id" :label="`${crew.name}（${crew.leader_name || ''}）`" />
                </el-select>
              </el-form-item>
              <el-form-item label="施工队长">
                <el-select v-model="constructionForm.captain_user_id" style="width:100%" clearable placeholder="不选则沿用班组队长">
                  <el-option v-for="captain in options.captains" :key="captain.id" :value="captain.id" :label="captain.name" />
                </el-select>
              </el-form-item>
              <el-form-item label="开工日期"><el-input v-model="constructionForm.start_date" placeholder="2026-11-26" /></el-form-item>
              <el-form-item><el-button type="primary" :disabled="!canManage" @click="startConstruction">指派并开工</el-button></el-form-item>
            </el-form>
          </template>
          <template v-else>
            <el-descriptions :column="3" border>
              <el-descriptions-item label="施工队长">{{ construction.captain_name }}</el-descriptions-item>
              <el-descriptions-item label="开工日期">{{ construction.start_date }}</el-descriptions-item>
              <el-descriptions-item label="进度">{{ construction.progress }}%</el-descriptions-item>
              <el-descriptions-item label="状态">{{ construction.status }}</el-descriptions-item>
              <el-descriptions-item label="完工日期">{{ construction.end_date || '-' }}</el-descriptions-item>
            </el-descriptions>
            <el-card class="mt12" shadow="never">
              <template #header>施工日志</template>
              <el-timeline>
                <el-timeline-item v-for="log in logs" :key="log.id" :timestamp="`${log.log_date} · ${log.created_by_name}`">
                  {{ log.content }}（进度 {{ log.progress }}%）
                </el-timeline-item>
              </el-timeline>
              <el-form v-if="canConstruct" label-width="90px">
                <el-form-item label="施工日志"><el-input v-model="logForm.content" type="textarea" :rows="2" /></el-form-item>
                <el-row :gutter="12">
                  <el-col :span="10"><el-form-item label="进度%"><el-input-number v-model="logForm.progress" :min="0" :max="100" style="width:100%" /></el-form-item></el-col>
                  <el-col :span="14"><el-form-item label="日期"><el-input v-model="logForm.log_date" placeholder="2026-11-26" /></el-form-item></el-col>
                </el-row>
                <el-form-item>
                  <el-button type="primary" @click="addLog">提交日志</el-button>
                  <el-button @click="completeConstruction">施工完成</el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </template>
        </el-tab-pane>

        <el-tab-pane label="验收与质保" name="acceptance">
          <template v-if="!acceptance">
            <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px"
              title="施工完成后上传验收与并网资料；尾款核销后系统自动登记质保。" />
            <el-form label-width="110px" style="max-width:600px">
              <el-form-item label="验收结果">
                <el-select v-model="acceptanceForm.result" style="width:100%">
                  <el-option label="验收通过" value="passed" /><el-option label="验收不通过" value="failed" />
                </el-select>
              </el-form-item>
              <el-form-item label="并网状态">
                <el-select v-model="acceptanceForm.grid_status" style="width:100%">
                  <el-option label="待申请" value="pending" /><el-option label="已提交资料" value="submitted" /><el-option label="已并网" value="connected" />
                </el-select>
              </el-form-item>
              <el-form-item label="并网回执号"><el-input v-model="acceptanceForm.grid_connection_no" /></el-form-item>
              <el-form-item label="备注"><el-input v-model="acceptanceForm.remark" type="textarea" :rows="2" /></el-form-item>
              <el-form-item label="并网资料">
                <div>
                  <FileUploader biz-type="acceptance" :biz-id="id" button-text="上传并网回执/验收单" @uploaded="onAcceptanceDoc" />
                  <span class="muted" style="margin-left:8px">已关联 {{ acceptanceForm.doc_ids.length }} 份</span>
                </div>
              </el-form-item>
              <el-form-item><el-button type="primary" :disabled="!canManage" @click="submitAcceptance">提交验收</el-button></el-form-item>
            </el-form>
          </template>
          <template v-else>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="验收单号">{{ acceptance.acceptance_no }}</el-descriptions-item>
              <el-descriptions-item label="验收结果">{{ acceptance.result === 'passed' ? '通过' : '不通过' }}</el-descriptions-item>
              <el-descriptions-item label="验收日期">{{ acceptance.accepted_at }}</el-descriptions-item>
              <el-descriptions-item label="并网状态">{{ acceptance.grid_status }}</el-descriptions-item>
              <el-descriptions-item label="并网回执号">{{ acceptance.grid_connection_no || '-' }}</el-descriptions-item>
              <el-descriptions-item label="备注">{{ acceptance.remark }}</el-descriptions-item>
            </el-descriptions>
            <el-card v-if="warranty" class="mt12" shadow="never">
              <template #header>质保登记（尾款结清自动生成）</template>
              <el-descriptions :column="2" border>
                <el-descriptions-item label="质保编号">{{ warranty.warranty_no }}</el-descriptions-item>
                <el-descriptions-item label="状态">{{ warranty.status }}</el-descriptions-item>
                <el-descriptions-item label="起止">{{ warranty.start_date }} 至 {{ warranty.end_date }}</el-descriptions-item>
                <el-descriptions-item label="范围">{{ warranty.scope }}</el-descriptions-item>
              </el-descriptions>
            </el-card>
            <el-alert v-else class="mt12" type="warning" :closable="false" show-icon title="尾款结清后自动登记质保。" />
          </template>
        </el-tab-pane>

        <el-tab-pane label="审计日志" name="audit">
          <el-timeline>
            <el-timeline-item v-for="log in audits" :key="log.id" :timestamp="`${log.created_at} · ${log.actor_name || '系统'}`">
              <b>{{ log.entity }} / {{ log.action }}</b>
              <div class="muted">{{ log.remark || '' }}</div>
            </el-timeline-item>
          </el-timeline>
          <div v-if="!audits.length" class="muted">暂无审计记录</div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <el-dialog v-model="quoteDialog" title="新建报价" width="800px">
      <div v-for="(item, index) in quoteForm.items" :key="index" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <el-input v-model="item.name" placeholder="项目名称" style="flex:1" />
        <el-input v-model="item.spec" placeholder="规格" style="width:150px" />
        <el-input v-model="item.unit" placeholder="单位" style="width:80px" />
        <el-input-number v-model="item.qty" :min="0.001" :precision="3" style="width:110px" />
        <el-input-number v-model="item.unit_price" :min="0" :precision="2" style="width:130px" />
        <el-button text type="danger" @click="quoteForm.items.splice(index, 1)">删除</el-button>
      </div>
      <el-button text type="primary" @click="quoteForm.items.push({ name: '', spec: '', unit: 'pcs', qty: 1, unit_price: 0 })">+ 添加明细</el-button>
      <el-form label-width="90px" class="mt12">
        <el-form-item label="优惠金额"><el-input-number v-model="quoteForm.discount_amount" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="quoteForm.remark" /></el-form-item>
        <el-form-item label="报价合计"><b>{{ money(quoteTotal - Number(quoteForm.discount_amount || 0)) }}</b></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quoteDialog = false">取消</el-button>
        <el-button type="primary" @click="submitQuote">提交审批</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="receiveDialog" title="收款核销" width="480px">
      <el-form label-width="90px">
        <el-form-item label="收款金额"><el-input-number v-model="receiveForm.amount" :min="0.01" :precision="2" style="width:100%" /></el-form-item>
        <el-form-item label="收款方式">
          <el-select v-model="receiveForm.method" style="width:100%">
            <el-option v-for="item in options.payment_methods" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="收款日期"><el-input v-model="receiveForm.received_at" placeholder="2026-11-26" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="receiveForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="receiveDialog = false">取消</el-button>
        <el-button type="primary" @click="submitReceive">确认核销</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="issueDialog" title="新建领料单" width="680px">
      <div v-for="(line, index) in issueForm.items" :key="index" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <el-select v-model="line.product_id" placeholder="选择产品" style="flex:1">
          <el-option v-for="product in options.products" :key="product.id" :value="product.id" :label="`${product.code} ${product.name}（${product.unit}）`" />
        </el-select>
        <el-input-number v-model="line.qty" :min="0.001" :precision="3" style="width:130px" />
        <el-button text type="danger" @click="issueForm.items.splice(index, 1)">删除</el-button>
      </div>
      <el-button text type="primary" @click="issueForm.items.push({ product_id: null, qty: 1 })">+ 添加产品</el-button>
      <el-form label-width="70px" class="mt12">
        <el-form-item label="备注"><el-input v-model="issueForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="issueDialog = false">取消</el-button>
        <el-button type="primary" @click="submitIssue">提交领料</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="returnDialog" title="余料退回" width="560px">
      <div v-for="line in returnForm.items" :key="line.product_id" style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
        <span style="flex:1">{{ line.product_name }}</span>
        <span class="muted">已领 {{ line.max }}</span>
        <el-input-number v-model="line.qty" :min="0" :max="line.max" :precision="3" style="width:130px" />
      </div>
      <el-form label-width="70px"><el-form-item label="备注"><el-input v-model="returnForm.remark" /></el-form-item></el-form>
      <template #footer>
        <el-button @click="returnDialog = false">取消</el-button>
        <el-button type="primary" @click="submitReturn">确认退回</el-button>
      </template>
    </el-dialog>
  </div>
</template>
