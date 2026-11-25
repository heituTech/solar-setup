<template>
  <div v-loading="loading">
    <div class="page-toolbar">
      <h3>{{ scopeTitle }}</h3>
      <div class="toolbar-actions">
        <el-tag v-if="org.position" type="info">{{ org.position.name }}</el-tag>
        <el-tag v-if="org.department" type="success">{{ org.department.name }}</el-tag>
      </div>
    </div>

    <!-- 销售 / 公司业务指标 -->
    <div class="kpi-grid" v-if="view === 'sales'">
      <div class="kpi-card">
        <div class="kpi-label">{{ t('customers') }}</div>
        <div class="kpi-value">{{ business.customers?.total || 0 }}</div>
        <div class="kpi-hint">{{ t('leads') }} {{ business.customers?.leads || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('quotes') }}</div>
        <div class="kpi-value">{{ business.quotes?.total || 0 }}</div>
        <div class="kpi-hint">{{ t('pendingReview') }} {{ business.quotes?.pending || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('orderAmount') }}</div>
        <div class="kpi-value">{{ money(finance.order_amount) }}</div>
        <div class="kpi-hint">{{ t('orders') }} {{ finance.orders || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('receivedAmount') }}</div>
        <div class="kpi-value">{{ money(finance.received_amount) }}</div>
        <div class="kpi-hint">{{ t('netReceived') }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('outstanding') }}</div>
        <div class="kpi-value">{{ money(finance.outstanding) }}</div>
        <div class="kpi-hint">{{ t('payment') }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('commissionDue') }}</div>
        <div class="kpi-value">{{ money(finance.commission_due) }}</div>
        <div class="kpi-hint">{{ t('finalAcceptance') }} + {{ t('payment') }}</div>
      </div>
      <div class="kpi-card" v-if="scope !== 'self'">
        <div class="kpi-label">{{ t('projects') }}</div>
        <div class="kpi-value">{{ activeProjects }}</div>
        <div class="kpi-hint">{{ t('workspace') }}</div>
      </div>
    </div>

    <!-- 工程部门 / 工程师指标 -->
    <div class="kpi-grid" v-else-if="view === 'engineering'">
      <div class="kpi-card">
        <div class="kpi-label">{{ t('totalSurveys') }}</div>
        <div class="kpi-value">{{ business.surveys?.total || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('pendingSurveys') }}</div>
        <div class="kpi-value">{{ business.surveys?.pending || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('activeSurveys') }}</div>
        <div class="kpi-value">{{ business.surveys?.active || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('completedSurveys') }}</div>
        <div class="kpi-value">{{ business.surveys?.completed || 0 }}</div>
      </div>
      <template v-if="scope === 'department'">
        <div class="kpi-card">
          <div class="kpi-label">{{ t('headcount') }}</div>
          <div class="kpi-value">{{ departmentStat.headcount }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">{{ t('vacancies') }}</div>
          <div class="kpi-value">{{ departmentStat.vacancies }}</div>
        </div>
      </template>
    </div>

    <!-- 财务部门指标 -->
    <div class="kpi-grid" v-else-if="view === 'finance'">
      <div class="kpi-card">
        <div class="kpi-label">{{ t('orderAmount') }}</div>
        <div class="kpi-value">{{ money(finance.order_amount) }}</div>
        <div class="kpi-hint">{{ t('orders') }} {{ finance.orders || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('receivedAmount') }}</div>
        <div class="kpi-value">{{ money(finance.received_amount) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('outstanding') }}</div>
        <div class="kpi-value">{{ money(finance.outstanding) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('commissionDue') }}</div>
        <div class="kpi-value">{{ money(finance.commission_due) }}</div>
      </div>
      <template v-if="scope === 'department'">
        <div class="kpi-card">
          <div class="kpi-label">{{ t('headcount') }}</div>
          <div class="kpi-value">{{ departmentStat.headcount }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">{{ t('vacancies') }}</div>
          <div class="kpi-value">{{ departmentStat.vacancies }}</div>
        </div>
      </template>
    </div>

    <!-- 人力资源部门 / 公司组织指标 -->
    <div class="kpi-grid" v-else>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('headcount') }}</div>
        <div class="kpi-value">{{ org.totals?.headcount || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('positions') }}</div>
        <div class="kpi-value">{{ org.totals?.positions || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('vacancies') }}</div>
        <div class="kpi-value">{{ org.totals?.vacancies || 0 }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">{{ t('departments') }}</div>
        <div class="kpi-value">{{ org.totals?.departments || 0 }}</div>
      </div>
    </div>

    <div class="panel" v-if="view === 'sales' && orders.length">
      <div class="panel-title">
        <h3>{{ t('orders') }}</h3>
        <el-button link type="primary" @click="$router.push('/workbench/orders')">{{ t('viewDetail') }}</el-button>
      </div>
      <el-table :data="orders.slice(0, 8)" :empty-text="t('noData')">
        <el-table-column prop="order_no" :label="t('orderNumber')" width="190" />
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="140" />
        <el-table-column :label="t('amount')" width="140">
          <template #default="{ row }">{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('outstanding')" width="140">
          <template #default="{ row }">{{ money(row.outstanding) }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="160">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div class="panel" v-if="showOrgTable">
      <div class="panel-title"><h3>{{ t('orgStructure') }}</h3></div>
      <el-table :data="org.departments || []" :empty-text="t('noData')">
        <el-table-column prop="name" :label="t('departments')" min-width="160" />
        <el-table-column prop="headcount" :label="t('headcount')" width="120" />
        <el-table-column prop="positions" :label="t('positions')" width="120" />
        <el-table-column prop="vacancies" :label="t('vacancies')" width="120" />
      </el-table>
    </div>

    <div class="panel">
      <div class="panel-title"><h3>{{ t('actions') }}</h3></div>
      <div class="toolbar-actions">
        <template v-if="salesRoles">
          <el-button :disabled="loading" @click="$router.push('/workbench/customers')">{{ t('newCustomer') }}</el-button>
          <el-button :disabled="loading" @click="$router.push('/workbench/surveys')">{{ t('newSurvey') }}</el-button>
          <el-button :disabled="loading" @click="$router.push('/workbench/quotes')">{{ t('newQuote') }}</el-button>
          <el-button :disabled="loading" @click="$router.push('/workbench/orders')">{{ t('orders') }}</el-button>
        </template>
        <template v-else-if="view === 'engineering'">
          <el-button :disabled="loading" @click="$router.push('/workbench/surveys')">{{ t('surveys') }}</el-button>
          <el-button :disabled="loading" @click="$router.push('/workbench/orders')">{{ t('orders') }}</el-button>
        </template>
        <template v-else-if="view === 'finance'">
          <el-button :disabled="loading" @click="$router.push('/workbench/ledger')">{{ t('ledger') }}</el-button>
          <el-button :disabled="loading" @click="$router.push('/workbench/settlements')">{{ t('settlements') }}</el-button>
        </template>
        <el-button v-if="auth.role === 'super_admin'" :disabled="loading" @click="$router.push('/workbench/admin')">{{ t('admin') }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt, money, statusType } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const auth = useAuthStore();
const org = ref({});
const business = ref({});
const finance = ref({});
const orders = ref([]);
const projects = ref([]);
const loading = ref(false);

const scope = computed(() => org.value.scope || 'self');
const salesRoles = computed(() => ['super_admin', 'sales_manager', 'salesperson'].includes(auth.role));
const view = computed(() => {
  if (scope.value === 'department') {
    const code = org.value.department?.code;
    if (code === 'engineering') return 'engineering';
    if (code === 'finance') return 'finance';
    if (code === 'hr') return 'hr';
    return 'sales';
  }
  if (scope.value === 'self') {
    if (['electrical_engineer', 'structural_engineer'].includes(auth.role)) return 'engineering';
    if (auth.role === 'accountant') return 'finance';
  }
  return 'sales';
});
const scopeTitle = computed(() => {
  if (scope.value === 'company') return t('companyOverview');
  if (scope.value === 'department') return t('departmentOverview');
  return t('myOverview');
});
const activeProjects = computed(() => projects.value.filter((item) => ['initializing', 'pending_assignment', 'in_delivery'].includes(item.status)).length);
const departmentStat = computed(() => {
  const code = org.value.department?.code;
  return (org.value.departments || []).find((item) => item.code === code)
    || { headcount: 0, positions: 0, vacancies: 0 };
});
const showOrgTable = computed(() => scope.value === 'company' || view.value === 'hr');

async function load() {
  loading.value = true;
  try {
    const results = await Promise.allSettled([
      get('/pv/api/org/overview'),
      get('/pv/api/workbench/overview'),
      get('/pv/api/workbench/finance/summary'),
      get('/pv/api/workbench/orders'),
      get('/pv/api/workbench/projects?page_size=100'),
    ]);
    if (results[0].status === 'fulfilled') org.value = results[0].value;
    if (results[1].status === 'fulfilled') business.value = results[1].value;
    if (results[2].status === 'fulfilled') finance.value = results[2].value;
    if (results[3].status === 'fulfilled') orders.value = results[3].value.orders || [];
    if (results[4].status === 'fulfilled') projects.value = results[4].value.projects || [];
    // 部门/个人概览不展示与其无关的数据源错误
    const critical = results.slice(0, 2).find((item) => item.status === 'rejected');
    if (critical) ElMessage.error(critical.reason.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
