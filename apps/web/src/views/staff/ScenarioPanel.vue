<template>
  <div class="scenario-panel">
    <div class="panel-title" style="display:flex;justify-content:space-between;align-items:center">
      <h3>{{ t('scenarios') }}</h3>
      <el-button v-if="canEdit" type="primary" size="small" @click="openScenarioDialog()">{{ t('newScenario') }}</el-button>
    </div>

    <el-empty v-if="!scenarios.length && !loading" :description="t('noData')" :image-size="60" />
    <el-collapse v-else v-model="expanded">
      <el-collapse-item v-for="sc in scenarios" :key="sc.id" :name="sc.id">
        <template #title>
          <div style="display:flex;gap:8px;align-items:center;flex:1">
            <el-tag size="small">{{ sc.scenario_no }}</el-tag>
            <span>{{ sceneLabel(sc.scene_type) }} · {{ gridLabel(sc.grid_type) }} · {{ installLabel(sc.install_type) }}</span>
            <span style="color:#909399;font-size:12px">{{ sc.monthly_kwh || '-' }} {{ t('kwhPerMonth') }}</span>
          </div>
          <div @click.stop style="margin-right:8px">
            <el-button v-if="canEdit" link size="small" @click="openScenarioDialog(sc)">{{ t('edit') }}</el-button>
            <el-button v-if="canEdit" link size="small" type="danger" @click="removeScenario(sc)">{{ t('delete') }}</el-button>
          </div>
        </template>

        <!-- 场景详情 -->
        <div class="scenario-detail">
          <div><span>{{ t('monthlyKwh') }}:</span> {{ sc.monthly_kwh ?? '-' }}</div>
          <div><span>{{ t('dayKwh') }}:</span> {{ sc.day_kwh ?? '-' }}</div>
          <div><span>{{ t('nightKwh') }}:</span> {{ sc.night_kwh ?? '-' }}</div>
          <div><span>{{ t('peakLoadKw') }}:</span> {{ sc.peak_load_kw ?? '-' }}</div>
          <div><span>{{ t('areaSqm') }}:</span> {{ sc.area_sqm ?? '-' }}</div>
        </div>

        <!-- 配置列表 -->
        <div style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>{{ t('systemConfigs') }}</strong>
            <el-button v-if="canEdit" size="small" @click="openConfigDialog(sc)">{{ t('newConfig') }}</el-button>
          </div>
          <el-table :data="configsOf(sc.id)" size="small" :empty-text="t('noData')">
            <el-table-column prop="config_no" :label="t('configNo')" width="180" />
            <el-table-column :label="t('configMethod')" width="100">
              <template #default="{ row }">{{ methodLabel(row.method) }}</template>
            </el-table-column>
            <el-table-column :label="t('capacityKw')" width="120">
              <template #default="{ row }">{{ row.capacity_kw ?? '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('referenceTotal')" width="160">
              <template #default="{ row }">{{ money(row.reference_total) }}</template>
            </el-table-column>
            <el-table-column :label="t('actions')" min-width="200">
              <template #default="{ row }">
                <el-button link size="small" @click="viewConfig(row)">{{ t('detail') }}</el-button>
                <el-button v-if="canEdit" link size="small" type="primary" @click="createOrder(row)">{{ t('createOrderFromConfig') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- 新建/编辑场景 dialog -->
    <el-dialog v-model="scenarioDialog" :title="scenarioForm.id ? t('editScenario') : t('newScenario')" width="640px">
      <el-form :model="scenarioForm" label-position="top">
        <div class="form-grid">
          <el-form-item :label="t('gridType')">
            <el-select v-model="scenarioForm.grid_type" style="width:100%">
              <el-option :label="t('gridOnGrid')" value="on_grid" />
              <el-option :label="t('gridOffGrid')" value="off_grid" />
              <el-option :label="t('gridHybrid')" value="hybrid" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('installTypeLabel')">
            <el-select v-model="scenarioForm.install_type" style="width:100%">
              <el-option :label="t('installRooftop')" value="rooftop" />
              <el-option :label="t('installGround')" value="ground" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('sceneType')">
            <el-select v-model="scenarioForm.scene_type" style="width:100%">
              <el-option :label="t('sceneResidential')" value="residential" />
              <el-option :label="t('sceneCafe')" value="cafe" />
              <el-option :label="t('sceneRestaurant')" value="restaurant" />
              <el-option :label="t('sceneSupermarket')" value="supermarket" />
              <el-option :label="t('sceneHotel')" value="hotel" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('monthlyKwh')">
            <el-input-number v-model="scenarioForm.monthly_kwh" :min="0" :controls="false" style="width:100%" />
          </el-form-item>
          <el-form-item :label="t('areaSqm')">
            <el-input-number v-model="scenarioForm.area_sqm" :min="0" :controls="false" style="width:100%" />
          </el-form-item>
          <el-form-item :label="t('peakLoadKw')">
            <el-input-number v-model="scenarioForm.peak_load_kw" :min="0" :controls="false" style="width:100%" />
          </el-form-item>
          <el-form-item :label="t('dayKwh')">
            <el-input-number v-model="scenarioForm.day_kwh" :min="0" :controls="false" style="width:100%" />
          </el-form-item>
          <el-form-item :label="t('nightKwh')">
            <el-input-number v-model="scenarioForm.night_kwh" :min="0" :controls="false" style="width:100%" />
          </el-form-item>
          <el-form-item class="span-2" :label="t('notes')">
            <el-input v-model="scenarioForm.notes" type="textarea" :rows="2" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="scenarioDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveScenario">{{ t('save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 新建配置 dialog（三选一） -->
    <el-dialog v-model="configDialog" :title="t('newConfig')" width="720px">
      <el-form label-position="top">
        <el-form-item :label="t('configMethod')">
          <el-radio-group v-model="configForm.method">
            <el-radio-button value="manual">{{ t('methodManual') }}</el-radio-button>
            <el-radio-button value="package">{{ t('methodPackage') }}</el-radio-button>
            <el-radio-button value="formula">{{ t('methodFormula') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <!-- 公式预览 -->
        <el-alert v-if="configForm.method === 'formula'" :title="t('formulaHint')" type="info" :closable="false" style="margin-bottom:12px" />
        <div v-if="configForm.method === 'formula' && formulaPreview" class="formula-preview">
          <div><span>{{ t('capacityKw') }}:</span> <strong>{{ formulaPreview.capacity_kw ?? '-' }}</strong></div>
          <div><span>{{ t('inverterKw') }}:</span> <strong>{{ formulaPreview.inverter_kw ?? '-' }}</strong></div>
          <div><span>{{ t('batteryKwh') }}:</span> <strong>{{ formulaPreview.battery_kwh ?? '-' }}</strong></div>
        </div>

        <!-- 套餐选择 -->
        <el-form-item v-if="configForm.method === 'package'" :label="t('selectPackage')">
          <el-select v-model="configForm.package_id" style="width:100%" :placeholder="t('selectPackage')">
            <el-option v-for="p in packages" :key="p.id" :label="`${p.name} (${money(p.price)})`" :value="p.id" />
          </el-select>
        </el-form-item>

        <!-- 手动选品 -->
        <template v-if="configForm.method === 'manual'">
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <el-select v-model="manualPick" :placeholder="t('product')" style="flex:1" filterable>
              <el-option v-for="p in products" :key="p.id" :label="`${p.name} (${money(p.price)})`" :value="p.id" />
            </el-select>
            <el-button @click="addManualItem">{{ t('addItem') }}</el-button>
          </div>
          <el-table :data="configForm.items" size="small">
            <el-table-column prop="name" :label="t('product')" min-width="180" />
            <el-table-column :label="t('quantity')" width="110">
              <template #default="{ row }"><el-input-number v-model="row.qty" :min="1" :controls="false" style="width:100%" @change="recalcItem(row)" /></template>
            </el-table-column>
            <el-table-column :label="t('unitPrice')" width="120">
              <template #default="{ row }"><el-input-number v-model="row.unit_price" :min="0" :controls="false" style="width:100%" @change="recalcItem(row)" /></template>
            </el-table-column>
            <el-table-column :label="t('subtotal')" width="110">
              <template #default="{ row }">{{ money(row.subtotal) }}</template>
            </el-table-column>
            <el-table-column width="60">
              <template #default="{ $index }"><el-button link type="danger" @click="configForm.items.splice($index, 1)">{{ t('delete') }}</el-button></template>
            </el-table-column>
          </el-table>
          <div style="text-align:right;margin-top:8px"><strong>{{ t('total') }}: {{ money(manualTotal) }}</strong></div>
        </template>

        <el-form-item :label="t('notes')" style="margin-top:12px">
          <el-input v-model="configForm.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="configDialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="saveConfig">{{ t('generateConfig') }}</el-button>
      </template>
    </el-dialog>

    <!-- 配置详情 drawer -->
    <el-drawer v-model="configDrawer" :title="t('configItems')" size="560px">
      <template v-if="currentConfig">
        <div class="detail-grid">
          <div class="detail-item"><span>{{ t('configNo') }}</span>{{ currentConfig.config_no }}</div>
          <div class="detail-item"><span>{{ t('configMethod') }}</span>{{ methodLabel(currentConfig.method) }}</div>
          <div class="detail-item"><span>{{ t('capacityKw') }}</span>{{ currentConfig.capacity_kw ?? '-' }}</div>
          <div class="detail-item"><span>{{ t('inverterKw') }}</span>{{ currentConfig.inverter_kw ?? '-' }}</div>
          <div class="detail-item"><span>{{ t('batteryKwh') }}</span>{{ currentConfig.battery_kwh ?? '-' }}</div>
          <div class="detail-item"><span>{{ t('referenceTotal') }}</span><strong>{{ money(currentConfig.reference_total) }}</strong></div>
        </div>
        <el-table :data="currentConfig.items || []" size="small" style="margin-top:16px">
          <el-table-column prop="name" :label="t('product')" min-width="180" />
          <el-table-column prop="qty" :label="t('quantity')" width="80" />
          <el-table-column :label="t('unitPrice')" width="110">
            <template #default="{ row }">{{ money(row.unit_price) }}</template>
          </el-table-column>
          <el-table-column :label="t('subtotal')" width="110">
            <template #default="{ row }">{{ money(row.subtotal) }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post, patch, del } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { money } from '../../utils/format';

const props = defineProps({ customerId: { type: Number, required: true } });
const emit = defineEmits(['order-created']);

const { t } = useI18n();
const auth = useAuthStore();
const canEdit = computed(() => ['super_admin', 'sales_manager', 'salesperson'].includes(auth.role));

const scenarios = ref([]);
const configsMap = ref({});
const expanded = ref([]);
const loading = ref(false);
const saving = ref(false);
const scenarioDialog = ref(false);
const configDialog = ref(false);
const configDrawer = ref(false);
const currentConfig = ref(null);
const products = ref([]);
const packages = ref([]);
const manualPick = ref(null);
const formulaPreview = ref(null);
const activeScenario = ref(null);

const scenarioForm = reactive({
  id: null, grid_type: 'on_grid', install_type: 'rooftop', scene_type: 'residential',
  monthly_kwh: null, area_sqm: null, peak_load_kw: null, day_kwh: null, night_kwh: null, notes: '',
});

const configForm = reactive({
  scenario_id: null, method: 'formula', package_id: null, items: [], notes: '',
});

const manualTotal = computed(() =>
  configForm.items.reduce((s, it) => s + (it.subtotal || 0), 0)
);

function sceneLabel(s) {
  return { residential: t('sceneResidential'), cafe: t('sceneCafe'), restaurant: t('sceneRestaurant'),
    supermarket: t('sceneSupermarket'), hotel: t('sceneHotel') }[s] || s;
}
function gridLabel(g) {
  return { on_grid: t('gridOnGrid'), off_grid: t('gridOffGrid'), hybrid: t('gridHybrid') }[g] || g;
}
function installLabel(i) {
  return { rooftop: t('installRooftop'), ground: t('installGround') }[i] || i;
}
function methodLabel(m) {
  return { manual: t('methodManual'), package: t('methodPackage'), formula: t('methodFormula') }[m] || m;
}
function configsOf(scenarioId) { return configsMap.value[scenarioId] || []; }

async function loadScenarios() {
  loading.value = true;
  try {
    const data = await get(`/pv/api/workbench/customers/${props.customerId}/scenarios`);
    scenarios.value = data.scenarios || [];
    // 加载所有场景的配置
    for (const sc of scenarios.value) {
      await loadConfigs(sc.id);
    }
  } catch (e) { ElMessage.error(e.message); }
  finally { loading.value = false; }
}

async function loadConfigs(scenarioId) {
  try {
    const data = await get(`/pv/api/workbench/scenarios/${scenarioId}/configs`);
    configsMap.value[scenarioId] = data.configs || [];
  } catch (e) { /* silent */ }
}

async function loadProducts() {
  try {
    const data = await get('/pv/api/products');
    products.value = (data.products || []).filter(p => !p.is_package);
    packages.value = (data.products || []).filter(p => p.is_package);
  } catch (e) { /* silent */ }
}

function openScenarioDialog(sc) {
  if (sc) Object.assign(scenarioForm, { ...sc });
  else Object.assign(scenarioForm, {
    id: null, grid_type: 'on_grid', install_type: 'rooftop', scene_type: 'residential',
    monthly_kwh: null, area_sqm: null, peak_load_kw: null, day_kwh: null, night_kwh: null, notes: '',
  });
  scenarioDialog.value = true;
}

async function saveScenario() {
  saving.value = true;
  try {
    const payload = { ...scenarioForm };
    delete payload.id;
    delete payload.scenario_no;
    delete payload.created_at;
    delete payload.updated_at;
    delete payload.customer_id;
    delete payload.created_by;
    if (scenarioForm.id) await patch(`/pv/api/workbench/scenarios/${scenarioForm.id}`, payload);
    else await post(`/pv/api/workbench/customers/${props.customerId}/scenarios`, payload);
    ElMessage.success(t('operationSuccess'));
    scenarioDialog.value = false;
    await loadScenarios();
  } catch (e) { ElMessage.error(e.message); }
  finally { saving.value = false; }
}

async function removeScenario(sc) {
  try {
    await ElMessageBox.confirm(t('confirm'), t('delete'), { type: 'warning' });
    await del(`/pv/api/workbench/scenarios/${sc.id}`);
    ElMessage.success(t('operationSuccess'));
    await loadScenarios();
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || e); }
}

async function openConfigDialog(sc) {
  activeScenario.value = sc;
  Object.assign(configForm, { scenario_id: sc.id, method: 'formula', package_id: null, items: [], notes: '' });
  manualPick.value = null;
  configDialog.value = true;
  await loadProducts();
  if (configForm.method === 'formula') await refreshFormulaPreview();
}

async function refreshFormulaPreview() {
  if (!activeScenario.value) return;
  try {
    formulaPreview.value = await get(`/pv/api/workbench/scenarios/${activeScenario.value.id}/formula-preview`);
  } catch (e) { formulaPreview.value = null; }
}

watch(() => configForm.method, (m) => {
  if (m === 'formula') refreshFormulaPreview();
});

function addManualItem() {
  if (!manualPick.value) return;
  const p = products.value.find(x => x.id === manualPick.value);
  if (!p) return;
  configForm.items.push({
    product_id: p.id, name: p.name, qty: 1, unit_price: Number(p.price), subtotal: Number(p.price),
  });
  manualPick.value = null;
}

function recalcItem(row) {
  row.subtotal = Math.round((row.qty || 0) * (row.unit_price || 0) * 100) / 100;
}

async function saveConfig() {
  if (configForm.method === 'package' && !configForm.package_id) return ElMessage.warning(t('selectPackage'));
  if (configForm.method === 'manual' && !configForm.items.length) return ElMessage.warning(t('items'));
  saving.value = true;
  try {
    const payload = { method: configForm.method, notes: configForm.notes };
    if (configForm.method === 'package') payload.package_id = configForm.package_id;
    if (configForm.method === 'manual') payload.items = configForm.items;
    await post(`/pv/api/workbench/scenarios/${activeScenario.value.id}/configs`, payload);
    ElMessage.success(t('operationSuccess'));
    configDialog.value = false;
    await loadConfigs(activeScenario.value.id);
  } catch (e) { ElMessage.error(e.message); }
  finally { saving.value = false; }
}

function viewConfig(row) {
  currentConfig.value = row;
  configDrawer.value = true;
}

async function createOrder(config) {
  try {
    await ElMessageBox.confirm(t('createOrderFromConfig') + '?', t('confirm'), { type: 'info' });
    const data = await post('/pv/api/workbench/orders/from-config', {
      customer_id: props.customerId, system_config_id: config.id,
    });
    ElMessage.success(`${t('operationSuccess')} ${data.order.order_no}`);
    emit('order-created', data.order);
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message || e); }
}

onMounted(loadScenarios);
</script>

<style scoped>
.scenario-detail {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 16px;
  padding: 8px 0; font-size: 13px; color: #606266;
}
.scenario-detail span { color: #909399; margin-right: 4px; }
.formula-preview {
  display: flex; gap: 24px; padding: 12px; background: #f5f7fa;
  border-radius: 4px; margin-bottom: 12px; font-size: 13px;
}
.formula-preview span { color: #909399; margin-right: 4px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.form-grid .span-2 { grid-column: span 2; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.detail-item span { display: block; color: #909399; font-size: 12px; margin-bottom: 4px; }

@media (max-width: 768px) {
  .scenario-detail,
  .form-grid,
  .detail-grid { grid-template-columns: 1fr; }
  .form-grid .span-2 { grid-column: span 1; }
  .formula-preview { flex-direction: column; gap: 6px; }
  .scenario-panel :deep(.el-collapse-item__header) {
    height: auto; min-height: 48px; align-items: flex-start; padding: 8px 0;
  }
  .scenario-panel :deep(.el-collapse-item__header > div) { flex-wrap: wrap; }
}
</style>
