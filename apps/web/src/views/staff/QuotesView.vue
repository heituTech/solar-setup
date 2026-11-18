<template>
  <div>
    <div class="page-toolbar">
      <h3>{{ t('quotes') }}</h3>
      <div class="toolbar-actions">
        <el-button @click="load" :loading="loading">{{ t('refresh') }}</el-button>
        <el-button v-if="canSell" type="primary" :disabled="loading" @click="openCreate">{{ t('newQuote') }}</el-button>
      </div>
    </div>

    <div class="panel">
      <el-table :data="quotes" v-loading="loading" :empty-text="t('noData')">
        <el-table-column prop="quote_no" :label="t('quoteNumber')" width="190" />
        <el-table-column prop="customer_name" :label="t('customerName')" min-width="140" />
        <el-table-column :label="t('total')" width="140">
          <template #default="{ row }">{{ money(row.total_amount, row.currency) }}</template>
        </el-table-column>
        <el-table-column :label="t('items')" width="80">
          <template #default="{ row }">{{ row.items.length }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="150">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="t('date')" width="160">
          <template #default="{ row }">{{ dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="260">
          <template #default="{ row }">
            <el-button v-if="row.status === 'draft' && canSell" link type="primary" :disabled="saving" @click="submit(row)">{{ t('submitReview') }}</el-button>
            <template v-if="row.status === 'pending_review' && isManager">
              <el-button link type="success" :disabled="saving" @click="approve(row, 'approved')">{{ t('approve') }}</el-button>
              <el-button link type="danger" :disabled="saving" @click="approve(row, 'rejected')">{{ t('reject') }}</el-button>
            </template>
            <el-button v-if="row.status === 'approved' && canSell" link type="primary" :disabled="saving" @click="accept(row)">{{ t('accept') }}</el-button>
            <el-button v-if="row.status === 'accepted' && canSell" link type="success" :disabled="saving" @click="convert(row)">{{ t('convertOrder') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialog" :title="t('newQuote')" width="720px">
      <el-form :model="form" label-position="top">
        <el-form-item :label="t('selectCustomer')">
          <el-select v-model="form.customer_id" filterable style="width: 100%">
            <el-option v-for="item in customers" :key="item.id" :value="item.id" :label="`${item.name} · ${item.phone || ''}`" />
          </el-select>
        </el-form-item>
        <div v-for="(item, index) in form.items" :key="index" class="item-row">
          <el-input v-model="item.name" :placeholder="t('product')" />
          <el-input-number v-model="item.qty" :min="1" :controls="false" />
          <el-input-number v-model="item.unit_price" :min="0" :controls="false" />
          <el-button link type="danger" @click="form.items.splice(index, 1)">{{ t('delete') }}</el-button>
        </div>
        <div class="toolbar-actions section-gap">
          <el-button @click="form.items.push({ name: '', qty: 1, unit_price: 0 })">{{ t('addItem') }}</el-button>
          <strong>{{ t('total') }}: {{ money(total) }}</strong>
        </div>
        <el-form-item :label="t('notes')" class="section-gap">
          <el-input v-model="form.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { get, post } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { dt, money, statusType } from '../../utils/format';

const { t } = useI18n();
const auth = useAuthStore();
const quotes = ref([]);
const customers = ref([]);
const loading = ref(false);
const saving = ref(false);
const dialog = ref(false);
const form = reactive({ customer_id: null, items: [{ name: '', qty: 1, unit_price: 0 }], notes: '' });

const canSell = computed(() => ['super_admin', 'sales_manager', 'salesperson'].includes(auth.role));
const isManager = computed(() => ['super_admin', 'sales_manager'].includes(auth.role));
const total = computed(() => form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0));

async function load() {
  loading.value = true;
  try {
    const [quoteData, customerData] = await Promise.all([
      get('/pv/api/workbench/quotes'),
      get('/pv/api/workbench/customers'),
    ]);
    quotes.value = quoteData.quotes || [];
    customers.value = customerData.customers || [];
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { customer_id: null, items: [{ name: '', qty: 1, unit_price: 0 }], notes: '' });
  dialog.value = true;
}

async function save() {
  if (!form.customer_id) return ElMessage.warning(t('selectCustomer'));
  const items = form.items.filter((item) => item.name && item.unit_price > 0);
  if (!items.length) return ElMessage.warning(t('items'));
  saving.value = true;
  try {
    await post('/pv/api/workbench/quotes', { customer_id: form.customer_id, items, notes: form.notes });
    ElMessage.success(t('operationSuccess'));
    dialog.value = false;
    await load();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}

async function submit(row) {
  saving.value = true;
  try {
    await post(`/pv/api/workbench/quotes/${row.id}/submit`, {});
    await load();
  } catch (error) { ElMessage.error(error.message); } finally { saving.value = false; }
}

async function approve(row, decision) {
  saving.value = true;
  try {
    await post(`/pv/api/workbench/quotes/${row.id}/approve`, { decision });
    await load();
  } catch (error) { ElMessage.error(error.message); } finally { saving.value = false; }
}

async function accept(row) {
  saving.value = true;
  try {
    await ElMessageBox.confirm(`${t('accept')} ${row.quote_no}?`, t('confirm'));
    await post(`/pv/api/workbench/quotes/${row.id}/accept`, {});
    await load();
  } catch (error) { if (error?.message) ElMessage.error(error.message); } finally { saving.value = false; }
}

async function convert(row) {
  saving.value = true;
  try {
    await ElMessageBox.confirm(`${t('convertOrder')} ${row.quote_no}?`, t('confirm'));
    const data = await post(`/pv/api/workbench/quotes/${row.id}/convert`, {});
    ElMessage.success(`${t('orders')}: ${data.order.order_no}`);
    await load();
  } catch (error) { if (error?.message) ElMessage.error(error.message); } finally { saving.value = false; }
}

onMounted(load);
</script>
