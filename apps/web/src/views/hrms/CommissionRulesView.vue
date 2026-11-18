<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('commissionRuleSettings') }}</h3>
      <div class="toolbar-actions">
        <el-date-picker v-model="period" type="month" value-format="YYYY-MM" :placeholder="t('effectivePeriod')" @change="loadRule" />
        <el-button type="primary" :loading="saving" :disabled="readonly" @click="save">{{ t('save') }}</el-button>
        <el-button @click="loadRule" :loading="loading">{{ t('refresh') }}</el-button>
      </div>
    </div>

    <el-alert v-if="readonly" :title="t('ruleReadonly')" type="warning" :closable="false" class="section-gap" />

    <div class="panel">
      <div class="panel-title"><h3>{{ t('effectivePeriod') }} {{ period }}</h3></div>
      <div class="form-grid">
        <el-form-item :label="t('retailRate')">
          <el-input-number v-model="form.retail_rate" :min="0" :max="100" :step="0.1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('bandRetailMax')">
          <el-input-number v-model="form.band_retail_max" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('engineeringRateLow')">
          <el-input-number v-model="form.engineering_rate_low" :min="0" :max="100" :step="0.1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('bandLowMax')">
          <el-input-number v-model="form.band_engineering_low_max" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('engineeringRateMid')">
          <el-input-number v-model="form.engineering_rate_mid" :min="0" :max="100" :step="0.1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('bandMidMax')">
          <el-input-number v-model="form.band_engineering_mid_max" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('engineeringRateHigh')">
          <el-input-number v-model="form.engineering_rate_high" :min="0" :max="100" :step="0.1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('firstStageRatio')">
          <el-input-number v-model="form.first_stage_ratio" :min="0" :max="100" :step="1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('firstStageThreshold')">
          <el-input-number v-model="form.first_stage_threshold" :min="0" :max="100" :step="1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('finalStageRatio')">
          <el-input-number v-model="form.final_stage_ratio" :min="0" :max="100" :step="1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('referralRate')">
          <el-input-number v-model="form.referral_rate" :min="0" :max="100" :step="0.1" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('referralExclusive')">
          <el-switch v-model="form.referral_exclusive" :disabled="readonly" />
        </el-form-item>
        <el-form-item :label="t('firstOrderReward')">
          <el-input-number v-model="form.first_order_reward" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('surveyThreshold')">
          <el-input-number v-model="form.survey_threshold" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('surveyReward')">
          <el-input-number v-model="form.survey_reward" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('baseSalary')">
          <el-input-number v-model="form.base_salary" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('championReward')">
          <el-input-number v-model="form.champion_reward" :min="0" :disabled="readonly" style="width:100%" />
        </el-form-item>
        <el-form-item :label="t('championBasis')">
          <el-select v-model="form.champion_basis" :disabled="readonly" style="width:100%">
            <el-option :label="t('championBasisReceived')" value="received" />
            <el-option :label="t('championBasisAmount')" value="amount" />
            <el-option :label="t('championBasisCommission')" value="commission" />
          </el-select>
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
        <el-table-column :label="t('retailRate')" width="130">
          <template #default="{ row }">{{ percent(row.retail_rate) }}</template>
        </el-table-column>
        <el-table-column :label="t('engineeringRateLow')" width="150">
          <template #default="{ row }">{{ percent(row.engineering_rate_low) }}</template>
        </el-table-column>
        <el-table-column :label="t('engineeringRateMid')" width="150">
          <template #default="{ row }">{{ percent(row.engineering_rate_mid) }}</template>
        </el-table-column>
        <el-table-column :label="t('engineeringRateHigh')" width="150">
          <template #default="{ row }">{{ percent(row.engineering_rate_high) }}</template>
        </el-table-column>
        <el-table-column :label="t('baseSalary')" width="110">
          <template #default="{ row }">{{ money(row.base_salary) }}</template>
        </el-table-column>
        <el-table-column prop="champion_basis" :label="t('championBasis')" width="130" />
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
  retail_rate: 8,
  band_retail_max: 1500,
  engineering_rate_low: 4,
  band_engineering_low_max: 5000,
  engineering_rate_mid: 5,
  band_engineering_mid_max: 15000,
  engineering_rate_high: 6,
  first_stage_ratio: 30,
  first_stage_threshold: 50,
  final_stage_ratio: 70,
  referral_rate: 1,
  referral_exclusive: true,
  first_order_reward: 20,
  survey_threshold: 15,
  survey_reward: 50,
  base_salary: 300,
  champion_reward: 0,
  champion_basis: 'received',
  note: '',
});

const readonly = computed(() => period.value < currentPeriodValue.value);

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function fillForm(rule) {
  form.retail_rate = Number((rule.retail_rate * 100).toFixed(2));
  form.band_retail_max = Number(rule.band_retail_max);
  form.engineering_rate_low = Number((rule.engineering_rate_low * 100).toFixed(2));
  form.band_engineering_low_max = Number(rule.band_engineering_low_max);
  form.engineering_rate_mid = Number((rule.engineering_rate_mid * 100).toFixed(2));
  form.band_engineering_mid_max = Number(rule.band_engineering_mid_max);
  form.engineering_rate_high = Number((rule.engineering_rate_high * 100).toFixed(2));
  form.first_stage_ratio = Number((rule.first_stage_ratio * 100).toFixed(2));
  form.first_stage_threshold = Number((rule.first_stage_threshold * 100).toFixed(2));
  form.final_stage_ratio = Number((rule.final_stage_ratio * 100).toFixed(2));
  form.referral_rate = Number((rule.referral_rate * 100).toFixed(2));
  form.referral_exclusive = Boolean(Number(rule.referral_exclusive));
  form.first_order_reward = Number(rule.first_order_reward);
  form.survey_threshold = Number(rule.survey_threshold);
  form.survey_reward = Number(rule.survey_reward);
  form.base_salary = Number(rule.base_salary);
  form.champion_reward = Number(rule.champion_reward);
  form.champion_basis = rule.champion_basis || 'received';
  form.note = rule.note || '';
}

async function loadList() {
  try {
    const data = await get('/pv/api/workbench/commission-rules');
    versions.value = data.rules || [];
    currentPeriodValue.value = data.current_period || currentPeriod();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function loadRule() {
  loading.value = true;
  try {
    const data = await get(`/pv/api/workbench/commission-rules/resolve?period=${period.value}`);
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
      retail_rate: form.retail_rate / 100,
      band_retail_max: form.band_retail_max,
      engineering_rate_low: form.engineering_rate_low / 100,
      band_engineering_low_max: form.band_engineering_low_max,
      engineering_rate_mid: form.engineering_rate_mid / 100,
      band_engineering_mid_max: form.band_engineering_mid_max,
      engineering_rate_high: form.engineering_rate_high / 100,
      first_stage_ratio: form.first_stage_ratio / 100,
      first_stage_threshold: form.first_stage_threshold / 100,
      final_stage_ratio: form.final_stage_ratio / 100,
      referral_rate: form.referral_rate / 100,
      referral_exclusive: form.referral_exclusive ? 1 : 0,
      first_order_reward: form.first_order_reward,
      survey_threshold: form.survey_threshold,
      survey_reward: form.survey_reward,
      base_salary: form.base_salary,
      champion_reward: form.champion_reward,
      champion_basis: form.champion_basis,
      note: form.note,
    };
    await put(`/pv/api/workbench/commission-rules/${period.value}`, payload);
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
