<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('managerRuleSettings') }}</h3>
      <div class="toolbar-actions">
        <el-date-picker v-model="period" type="month" value-format="YYYY-MM" :placeholder="t('effectivePeriod')" @change="loadRule" />
        <el-button type="primary" :loading="saving" :disabled="readonly" @click="save">{{ t('save') }}</el-button>
        <el-button @click="loadRule" :loading="loading">{{ t('refresh') }}</el-button>
      </div>
    </div>

    <el-alert v-if="readonly" :title="t('ruleReadonly')" type="warning" :closable="false" class="section-gap" />
    <el-alert :title="t('managerRulesHint')" type="info" :closable="false" class="section-gap" />

    <div class="panel">
      <div class="panel-title"><h3>{{ t('effectivePeriod') }} {{ period }}</h3></div>
      <div class="form-grid">
        <el-form-item :label="t('tier1Max')">
          <el-input-number v-model="form.tier1_max" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('tier1Rate')">
          <el-input-number v-model="form.tier1_rate" :min="0" :max="100" :step="0.1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('tier2Max')">
          <el-input-number v-model="form.tier2_max" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('tier2Rate')">
          <el-input-number v-model="form.tier2_rate" :min="0" :max="100" :step="0.1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('tier3Rate')">
          <el-input-number v-model="form.tier3_rate" :min="0" :max="100" :step="0.1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('baseSalary')">
          <el-input-number v-model="form.base_salary" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('teamThreshold')">
          <el-input-number v-model="form.team_threshold" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('teamBonus')">
          <el-input-number v-model="form.team_bonus" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('notes')">
          <el-input v-model="form.note" :disabled="readonly" />
        </el-form-item>
      </div>
    </div>

    <div class="panel section-gap">
      <div class="panel-title"><h3>{{ t('ruleHistory') }}</h3></div>
      <el-table :data="versions" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="effective_period" :label="t('effectivePeriod')" width="120" />
        <el-table-column :label="t('tier1Max')" width="130">
          <template #default="{ row }">{{ money(row.tier1_max) }}</template>
        </el-table-column>
        <el-table-column :label="t('tier1Rate')" width="120">
          <template #default="{ row }">{{ percent(row.tier1_rate) }}</template>
        </el-table-column>
        <el-table-column :label="t('tier2Max')" width="130">
          <template #default="{ row }">{{ money(row.tier2_max) }}</template>
        </el-table-column>
        <el-table-column :label="t('tier2Rate')" width="120">
          <template #default="{ row }">{{ percent(row.tier2_rate) }}</template>
        </el-table-column>
        <el-table-column :label="t('tier3Rate')" width="120">
          <template #default="{ row }">{{ percent(row.tier3_rate) }}</template>
        </el-table-column>
        <el-table-column :label="t('baseSalary')" width="110">
          <template #default="{ row }">{{ money(row.base_salary) }}</template>
        </el-table-column>
        <el-table-column :label="t('teamThreshold')" width="130">
          <template #default="{ row }">{{ money(row.team_threshold) }}</template>
        </el-table-column>
        <el-table-column :label="t('teamBonus')" width="120">
          <template #default="{ row }">{{ money(row.team_bonus) }}</template>
        </el-table-column>
        <el-table-column prop="note" :label="t('notes')" min-width="160" />
        <el-table-column :label="t('date')" width="170">
          <template #default="{ row }">{{ dt(row.updated_at) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { get, put } from '../../api/client';
import { currentPeriod, dt, money } from '../../utils/format';

const { t } = useI18n();
const period = ref(currentPeriod());
const currentPeriodValue = ref(currentPeriod());
const versions = ref([]);
const loading = ref(false);
const saving = ref(false);
const form = reactive({
  tier1_max: 50000,
  tier1_rate: 1,
  tier2_max: 200000,
  tier2_rate: 1.2,
  tier3_rate: 1.5,
  base_salary: 0,
  team_threshold: 0,
  team_bonus: 0,
  note: '',
});

const readonly = computed(() => period.value < currentPeriodValue.value);

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function fillForm(rule) {
  form.tier1_max = Number(rule.tier1_max);
  form.tier1_rate = Number((rule.tier1_rate * 100).toFixed(2));
  form.tier2_max = Number(rule.tier2_max);
  form.tier2_rate = Number((rule.tier2_rate * 100).toFixed(2));
  form.tier3_rate = Number((rule.tier3_rate * 100).toFixed(2));
  form.base_salary = Number(rule.base_salary);
  form.team_threshold = Number(rule.team_threshold);
  form.team_bonus = Number(rule.team_bonus);
  form.note = rule.note || '';
}

async function loadList() {
  try {
    const data = await get('/pv/api/workbench/manager-commission-rules');
    versions.value = data.rules || [];
    currentPeriodValue.value = data.current_period || currentPeriod();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function loadRule() {
  loading.value = true;
  try {
    const data = await get(`/pv/api/workbench/manager-commission-rules/resolve?period=${period.value}`);
    fillForm(data.rule);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      tier1_max: form.tier1_max,
      tier1_rate: form.tier1_rate / 100,
      tier2_max: form.tier2_max,
      tier2_rate: form.tier2_rate / 100,
      tier3_rate: form.tier3_rate / 100,
      base_salary: form.base_salary,
      team_threshold: form.team_threshold,
      team_bonus: form.team_bonus,
      note: form.note,
    };
    await put(`/pv/api/workbench/manager-commission-rules/${period.value}`, payload);
    ElMessage.success(t('ruleSaved'));
    await Promise.all([loadList(), loadRule()]);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadList();
  await loadRule();
});
</script>
