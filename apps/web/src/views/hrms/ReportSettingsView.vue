<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('reportRecipients') }}</h3>
      <div class="toolbar-actions">
        <el-input v-model="newRecipient.email" :placeholder="t('recipientEmail')" style="width:220px" />
        <el-input v-model="newRecipient.name" :placeholder="t('recipientName')" style="width:160px" />
        <el-button type="primary" :loading="saving" @click="addRecipient">{{ t('addRecipient') }}</el-button>
      </div>
    </div>

    <el-alert :title="t('monthEndHint')" type="info" :closable="false" />

    <div class="panel section-gap">
      <el-table :data="recipients" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="email" :label="t('recipientEmail')" min-width="220" />
        <el-table-column prop="name" :label="t('recipientName')" min-width="140" />
        <el-table-column prop="created_at" :label="t('date')" width="180" />
        <el-table-column :label="t('actions')" width="100">
          <template #default="{ row }">
            <el-button link type="danger" @click="removeRecipient(row)">{{ t('delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="page-toolbar section-gap">
      <h3>{{ t('performanceReport') }}</h3>
      <div class="toolbar-actions">
        <el-date-picker v-model="sendPeriod" type="month" value-format="YYYY-MM" :placeholder="t('month')" />
        <el-select v-model="sendType" style="width:160px">
          <el-option :label="t('sendPersonalReport')" value="personal" />
          <el-option :label="t('sendTeamReport')" value="team" />
          <el-option :label="t('sendAllReports')" value="all" />
        </el-select>
        <el-button type="primary" :loading="sending" @click="send">{{ t('sendReport') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <el-date-picker v-model="logPeriod" type="month" value-format="YYYY-MM" :placeholder="t('month')" clearable @change="reloadLogs" />
        <el-select v-model="logStatus" clearable :placeholder="t('reportStatus')" style="width:160px" @change="reloadLogs">
          <el-option label="sent" value="sent" />
          <el-option label="pending" value="pending" />
          <el-option label="failed" value="failed" />
        </el-select>
        <el-button @click="reloadLogs" :loading="logLoading">{{ t('refresh') }}</el-button>
      </div>
      <el-table :data="logs" v-loading="logLoading" :empty-text="t('noData')">
        <el-table-column prop="period" :label="t('month')" width="110" />
        <el-table-column prop="report_type" :label="t('reportType')" width="120" />
        <el-table-column prop="recipient" :label="t('recipientEmail')" min-width="220" />
        <el-table-column :label="t('reportStatus')" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'sent' ? 'success' : row.status === 'failed' ? 'danger' : 'info'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="error" :label="t('notes')" min-width="180" />
        <el-table-column prop="created_at" :label="t('date')" width="180" />
      </el-table>
      <el-pagination style="margin-top:12px; justify-content:flex-end" background layout="total, prev, pager, next, jumper" :total="logTotal" :page-size="pageSize" :current-page="logPage" @current-change="onPage" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { del, get, post } from '../../api/client';
import { currentPeriod } from '../../utils/format';

const { t } = useI18n();
const recipients = ref([]);
const newRecipient = reactive({ email: '', name: '' });
const loading = ref(false);
const saving = ref(false);
const sending = ref(false);
const sendPeriod = ref(currentPeriod());
const sendType = ref('all');
const logs = ref([]);
const logPeriod = ref('');
const logStatus = ref('');
const logPage = ref(1);
const logTotal = ref(0);
const logLoading = ref(false);
const pageSize = ref(10);

async function loadRecipients() {
  loading.value = true;
  try {
    const data = await get('/pv/api/hrms/report/recipients');
    recipients.value = data.recipients || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function addRecipient() {
  if (!newRecipient.email) {
    ElMessage.warning(t('recipientEmail'));
    return;
  }
  saving.value = true;
  try {
    await post('/pv/api/hrms/report/recipients', { email: newRecipient.email, name: newRecipient.name });
    newRecipient.email = '';
    newRecipient.name = '';
    ElMessage.success(t('operationSuccess'));
    await loadRecipients();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function removeRecipient(row) {
  try {
    await ElMessageBox.confirm(`${t('delete')} ${row.email}?`, t('confirm'));
    await del(`/pv/api/hrms/report/recipients/${row.id}`);
    ElMessage.success(t('operationSuccess'));
    await loadRecipients();
  } catch (error) {
    if (error?.message) ElMessage.error(error.message);
  }
}

async function loadLogs() {
  logLoading.value = true;
  try {
    const params = new URLSearchParams();
    params.set('page', logPage.value);
    params.set('page_size', pageSize.value);
    if (logPeriod.value) params.set('period', logPeriod.value);
    if (logStatus.value) params.set('status', logStatus.value);
    const data = await get(`/pv/api/hrms/report/logs?${params.toString()}`);
    logs.value = data.logs || [];
    logTotal.value = data.total || 0;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    logLoading.value = false;
  }
}

function reloadLogs() {
  logPage.value = 1;
  return loadLogs();
}

function onPage(value) {
  logPage.value = value;
  loadLogs();
}

async function send() {
  sending.value = true;
  try {
    const data = await post('/pv/api/hrms/report/send', { period: sendPeriod.value, type: sendType.value });
    const summary = data.summary || {};
    ElMessage.success(t('emailSentSummary', { sent: summary.sent || 0, skipped: summary.skipped || 0, failed: summary.failed || 0 }));
    if (summary.errors && summary.errors.length) {
      ElMessage.warning(summary.errors.map((item) => item.error).join('; '));
    }
    await reloadLogs();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    sending.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadRecipients(), loadLogs()]);
});
</script>
