<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('serviceHealth') }}</h3>
      <div class="toolbar-actions">
        <span class="muted">{{ t('checkedAt') }}: {{ dt(checkedAt) }}</span>
        <el-button type="primary" @click="load" :loading="loading">{{ t('refresh') }}</el-button>
      </div>
    </div>

    <div class="kpi-grid">
      <div v-for="item in services" :key="item.service" class="kpi-card">
        <div class="kpi-label">{{ t(item.service) }}</div>
        <div class="kpi-value">
          <el-tag :type="item.status === 'ok' ? 'success' : 'danger'">
            {{ item.status === 'ok' ? t('healthy') : t('unhealthy') }}
          </el-tag>
        </div>
        <div class="kpi-hint">{{ t('latency') }} {{ item.latency_ms }} ms</div>
      </div>
    </div>

    <div class="panel">
      <el-table :data="services" v-loading="loading" :empty-text="t('noData')">
        <el-table-column :label="t('service')" width="160">
          <template #default="{ row }">{{ t(row.service) }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="140">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ok' ? 'success' : 'danger'">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('latency')" width="130">
          <template #default="{ row }">{{ row.latency_ms }} ms</template>
        </el-table-column>
        <el-table-column :label="t('date')" min-width="200">
          <template #default="{ row }">{{ dt(row.time) }}</template>
        </el-table-column>
        <el-table-column prop="error" :label="t('notes')" min-width="220" />
      </el-table>
    </div>

    <div class="panel section-gap">
      <p class="muted">{{ t('integrationHint') }}</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get } from '../../api/client';
import { dt } from '../../utils/format';
import { useStatusLabel } from '../../utils/status';

const { t } = useI18n();
const statusLabel = useStatusLabel();
const services = ref([]);
const checkedAt = ref(null);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await get('/pv/api/admin/health');
    services.value = data.services || [];
    checkedAt.value = data.checked_at;
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
