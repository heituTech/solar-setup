// Role-based admin console
(function () {
  const TOKEN_KEY = 'staff_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let me = null;

  let currentTab = 'products';
  let currentCategory = 'inverters';
  let approvalScope = 'to_review';

  let productsCache = {};
  let productFilters = ProductCatalog.defaultFilters('inverters');
  let productPage = 1;
  let accountsCache = [];
  let accountsLoaded = false;
  let accountFilters = { keyword: '', role: '', status: '' };
  let accountPage = 1;
  let approvalsCache = [];
  let approvalsLoaded = false;
  let approvalFilters = { type: '', status: '' };
  let approvalPage = 1;
  let settingsCache = null;
  let flowsCache = [];
  let editingProductId = null;
  let editingAccountId = null;
  let editingFlowId = null;
  let rejectApprovalId = null;

  const TECH_OPTIONS = ['N type', 'P type', 'Topcon', 'HTJ', 'BC'];
  const CATEGORIES = ['inverters', 'panels', 'batteries'];
  const DIRECT_ROLES = ['super_admin', 'sales_manager'];

  /* ===================== Helpers ===================== */

  function errMsg(e) {
    const key = e && e.error;
    if (!key) return t('error');
    const value = t(key);
    return value === key ? key : value;
  }

  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && token) headers['Authorization'] = 'Bearer ' + token;
    const r = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await r.json(); } catch {}
    if (r.status === 401) {
      logout(true);
      throw { status: 401, error: 'unauthorized' };
    }
    if (!r.ok && r.status !== 202) {
      throw { status: r.status, error: (data && data.error) || 'error' };
    }
    return { status: r.status, data };
  }

  function showToast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = isError ? 'var(--danger)' : 'var(--success)';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }

  function money(p) {
    const usd = Number(p.price_usd || 0);
    const khr = Number(p.price_khr || 0);
    const usdText = '$' + usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return khr > 0 ? usdText + ' / ' + khr.toLocaleString() + ' KHR' : usdText;
  }

  function payload(a) {
    if (!a.payload) return {};
    if (typeof a.payload === 'string') {
      try { return JSON.parse(a.payload) || {}; } catch { return {}; }
    }
    return a.payload;
  }

  function requestTypeLabel(type) {
    const map = {
      product_create: 'req_product_create',
      product_update: 'req_product_update',
      product_delete: 'req_product_delete',
      account_create: 'req_account_create',
      account_update: 'req_account_update',
      account_delete: 'req_account_delete',
      account_register: 'req_account_register',
    };
    return map[type] ? t(map[type]) : type;
  }

  function statusLabel(status) {
    const map = {
      pending: 'pending',
      approved: 'approved',
      rejected: 'rejected',
      cancelled: 'cancelled',
    };
    return map[status] ? t(map[status]) : status;
  }

  /* ===================== Auth ===================== */

  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('loginPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });

  async function login() {
    const identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!identifier || !password) {
      showToast(t('required'), true);
      return;
    }
    try {
      const { data } = await api('/pv/api/auth/login', {
        method: 'POST',
        body: { identifier, password },
        auth: false,
      });
      if (data.user.role === 'member') {
        showToast(t('staff_only'), true);
        return;
      }
      token = data.token;
      me = data.user;
      localStorage.setItem(TOKEN_KEY, token);
      showPanel();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  }

  function logout(silent) {
    token = '';
    me = null;
    localStorage.removeItem(TOKEN_KEY);
    document.getElementById('loginBox').style.display = '';
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('loginPassword').value = '';
    if (!silent) showToast(t('logged_out'));
  }

  /* ===================== Staff registration ===================== */

  let countries = [];
  let codeTimer = null;

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setAuthMode(mode) {
    document.querySelectorAll('#authTabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    document.getElementById('loginForm').style.display = mode === 'login' ? '' : 'none';
    document.getElementById('registerForm').style.display = mode === 'register' ? '' : 'none';
    if (mode === 'register') {
      loadManagers();
      updateRegisterRole();
    }
  }

  document.querySelectorAll('#authTabs button').forEach((b) => {
    b.addEventListener('click', () => setAuthMode(b.dataset.mode));
  });

  async function loadManagers() {
    try {
      const { data } = await api('/pv/api/auth/managers', { auth: false });
      const list = Array.isArray(data.managers) ? data.managers : [];
      const select = document.getElementById('sr_manager');
      select.innerHTML = list.length
        ? list.map((m) => `<option value="${m.id}">${escapeHtml(m.username)}${m.full_name ? ' · ' + escapeHtml(m.full_name) : ''}</option>`).join('')
        : `<option value="">${escapeHtml(t('manager_none'))}</option>`;
    } catch (e) {
      // Leave the select empty; the submit handler blocks salesperson registration.
    }
  }

  function updateRegisterRole() {
    const role = document.getElementById('sr_role').value;
    document.getElementById('sr_managerField').style.display = role === 'salesperson' ? '' : 'none';
  }

  document.getElementById('sr_role').addEventListener('change', updateRegisterRole);

  function fillPhoneCountries() {
    const select = document.getElementById('sr_phone_country');
    select.innerHTML = countries
      .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.name)} +${escapeHtml(c.dial)}</option>`)
      .join('');
    select.value = countries.some((c) => c.code === 'KH') ? 'KH' : (countries[0] ? countries[0].code : '');
  }

  function startCooldown(btn, seconds) {
    if (codeTimer) clearInterval(codeTimer);
    let left = seconds;
    btn.disabled = true;
    btn.textContent = left + 's';
    codeTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(codeTimer);
        codeTimer = null;
        btn.disabled = false;
        btn.textContent = t('send_code');
      } else {
        btn.textContent = left + 's';
      }
    }, 1000);
  }

  document.getElementById('sr_sendCode').addEventListener('click', async () => {
    const email = document.getElementById('sr_email').value.trim();
    if (!email) {
      showToast(t('email'), true);
      return;
    }
    const btn = document.getElementById('sr_sendCode');
    try {
      const { data } = await api('/pv/api/auth/request-code', {
        method: 'POST',
        body: { email },
        auth: false,
      });
      showToast(t('code_sent'));
      if (data.dev_mode) document.getElementById('sr_devHint').style.display = '';
      startCooldown(btn, 60);
    } catch (e) {
      showToast(errMsg(e), true);
    }
  });

  document.getElementById('registerBtn').addEventListener('click', async () => {
    const role = document.getElementById('sr_role').value;
    const managerId = role === 'salesperson' ? Number(document.getElementById('sr_manager').value) : null;
    if (role === 'salesperson' && !managerId) {
      showToast(t('manager_required'), true);
      return;
    }
    const body = {
      role,
      manager_id: managerId,
      full_name: document.getElementById('sr_name').value.trim(),
      username: document.getElementById('sr_username').value.trim(),
      phone_country: document.getElementById('sr_phone_country').value,
      phone: document.getElementById('sr_phone').value.trim(),
      email: document.getElementById('sr_email').value.trim(),
      code: document.getElementById('sr_code').value.trim(),
      password: document.getElementById('sr_password').value,
    };
    try {
      const result = await api('/pv/api/auth/register', { method: 'POST', body, auth: false });
      if (result.status === 202) {
        showToast(t('registration_pending'));
        document.getElementById('sr_code').value = '';
        document.getElementById('sr_password').value = '';
        setAuthMode('login');
        return;
      }
      const { data } = result;
      token = data.token;
      me = data.user;
      localStorage.setItem(TOKEN_KEY, token);
      showPanel();
      showToast(t('saved'));
    } catch (e) {
      showToast(errMsg(e), true);
    }
  });

  async function loadMe() {
    if (!token) return null;
    try {
      const { data } = await api('/pv/api/auth/me');
      if (!data.user || data.user.role === 'member') {
        logout(true);
        return null;
      }
      me = data.user;
      return me;
    } catch (e) {
      return null;
    }
  }

  function showPanel() {
    document.getElementById('loginBox').style.display = 'none';
    document.getElementById('adminPanel').style.display = '';
    document.getElementById('userName').textContent = me.username || me.email || '';
    const badge = document.getElementById('userRoleBadge');
    badge.textContent = t('role_' + me.role);
    badge.className = 'role-badge role-' + me.role;

    toggleTab('accounts', me.role === 'super_admin' || me.role === 'sales_manager');
    toggleTab('settings', me.role === 'super_admin' || me.role === 'sales_manager');
    toggleTab('approvals', true);
    toggleTab('flows', me.role === 'super_admin');

    document.querySelectorAll('#mainTabs .tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector('#mainTabs .tab-btn[data-tab="products"]').classList.add('active');
    switchTab('products');
  }

  function toggleTab(name, visible) {
    const btn = document.querySelector(`#mainTabs .tab-btn[data-tab="${name}"]`);
    if (btn) btn.style.display = visible ? '' : 'none';
  }

  /* ===================== Tabs ===================== */

  document.querySelectorAll('#mainTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.style.display === 'none') return;
      document.querySelectorAll('#mainTabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      switchTab(btn.dataset.tab);
    });
  });

  function switchTab(tab) {
    currentTab = tab;
    document.getElementById('productsPanel').style.display = tab === 'products' ? '' : 'none';
    document.getElementById('accountsPanel').style.display = tab === 'accounts' ? '' : 'none';
    document.getElementById('approvalsPanel').style.display = tab === 'approvals' ? '' : 'none';
    document.getElementById('flowsPanel').style.display = tab === 'flows' ? '' : 'none';
    document.getElementById('settingsPanel').style.display = tab === 'settings' ? '' : 'none';
    if (tab === 'products') loadProducts();
    if (tab === 'accounts') loadAccounts();
    if (tab === 'approvals') loadApprovals();
    if (tab === 'flows') loadFlows();
    if (tab === 'settings') loadSettings();
  }

  /* ===================== Products ===================== */

  document.querySelectorAll('#productsPanel .sub-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#productsPanel .sub-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      productFilters = ProductCatalog.defaultFilters(currentCategory);
      productPage = 1;
      loadProducts();
    });
  });

  function updateProductHint() {
    const hint = document.getElementById('productHint');
    if (me.role === 'salesperson') {
      hint.textContent = t('product_needs_approval');
      hint.style.display = '';
    } else {
      hint.textContent = '';
      hint.style.display = 'none';
    }
  }

  async function loadProducts() {
    updateProductHint();
    const list = document.getElementById('productList');
    list.innerHTML = `<div class="card empty-state">${t('loading')}</div>`;
    try {
      const { data } = await api('/pv/api/products/admin/' + currentCategory + '?status=all');
      productsCache[currentCategory] = data;
      renderProductFilters();
      renderProductList();
    } catch (e) {
      list.innerHTML = `<div class="card empty-state">${errMsg(e)}</div>`;
    }
  }

  // Filters and paging run entirely in the browser: the full catalog is
  // already cached, only one page of matches is shown at a time.
  function renderProductFilters() {
    const bar = document.getElementById('productFilters');
    const data = productsCache[currentCategory] || [];
    bar.innerHTML = ProductCatalog.barHtml(currentCategory, data, productFilters, t, { status: true, hideSearch: true }) +
      `<div class="filter-footer">
        <button type="button" class="btn btn-primary btn-sm btn-add" id="addProductBtn">${escapeHtml(t('add_product'))}</button>
        <div class="filter-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-filter-action="reset">${escapeHtml(t('reset_filters'))}</button>
          <button type="button" class="btn btn-primary btn-sm" data-filter-action="search">${escapeHtml(t('search'))}</button>
        </div>
      </div>`;
    ProductCatalog.bind(bar, productFilters, () => {
      productPage = 1;
      renderProductList();
    }, () => {
      productFilters = ProductCatalog.defaultFilters(currentCategory);
      productPage = 1;
      renderProductFilters();
      renderProductList();
    });
    document.getElementById('addProductBtn').addEventListener('click', () => openProductModal(null));
  }

  function renderProductList() {
    const list = document.getElementById('productList');
    const data = productsCache[currentCategory] || [];
    const filtered = ProductCatalog.filter(currentCategory, data, productFilters);
    if (!filtered.length) {
      list.innerHTML = `<div class="card empty-state">${t('no_data')}</div>`;
      return;
    }
    const pageSize = ProductCatalog.PAGE_SIZE;
    const pageCount = Math.ceil(filtered.length / pageSize);
    if (productPage > pageCount) productPage = pageCount;
    if (productPage < 1) productPage = 1;
    const shown = filtered.slice((productPage - 1) * pageSize, productPage * pageSize);
    list.innerHTML = shown.map(renderProduct).join('') + ProductCatalog.pagerHtml(productPage, pageCount, t);
    bindProductActions();
    ProductCatalog.bindPager(list, (page) => {
      productPage = page;
      renderProductList();
    });
  }

  function parUnits(n) {
    return Number(n) > 1 ? `×${Number(n)}` : t('no');
  }

  function renderProduct(p) {
    const base = `${p.brand}${p.model ? ' ' + p.model : ''}`;
    let title = '';
    let meta = '';
    if (currentCategory === 'inverters') {
      const mpptSpec = p.mppt_max_current_a || p.mppt_max_voltage_v
        ? ` · ${p.mppt_max_current_a ? fmtDec1(p.mppt_max_current_a) + 'A' : '-'}/${p.mppt_max_voltage_v ? fmtDec1(p.mppt_max_voltage_v) + 'V' : '-'}`
        : '';
      const gridOut = p.type === 'hybrid' ? ` · ${t('grid_output_max_w')}: ${p.grid_output_max_w ? p.grid_output_max_w + 'W' : '-'} · ${t('battery_less_start')}: ${Number(p.battery_less_start) ? t('yes') : t('no')}` : '';
      const typeLabel = p.type === 'hybrid' ? t('hybrid') : t('off_grid');
      title = `${base} · ${typeLabel} · ${p.rated_power}W · ${p.battery_voltage}`;
      const par = [];
      if (p.type === 'hybrid') par.push(`${t('grid_parallel_short')}: ${parUnits(p.grid_parallel_max)}`);
      par.push(`${t('offgrid_parallel_short')}: ${parUnits(p.offgrid_parallel_max)}`);
      meta = `MPPT×${p.mppt_channels}${mpptSpec} · ${par.join(' · ')}${gridOut} · ${t('warranty')}: ${p.warranty_months}${t('months')}`;
    } else if (currentCategory === 'panels') {
      const tech = Array.isArray(p.technology) ? p.technology.join('/') : '';
      const elSpec = `${p.voc_v ? ` · Voc ${fmtDec1(p.voc_v)}V` : ''}${p.isc_a ? ` · Isc ${fmtDec1(p.isc_a)}A` : ''}`;
      title = `${base} · ${p.rated_power}W · ${p.glass_type === 'double' ? t('double_glass') : t('single_glass')}${tech ? ' · ' + tech : ''}`;
      const size = [p.length_mm, p.width_mm, p.height_mm].every((v) => v !== null && v !== undefined && v !== '')
        ? `${p.length_mm}×${p.width_mm}×${p.height_mm}mm`
        : '-';
      meta = `${t('dimensions')}: ${size}${elSpec} · ${t('warranty')}: ${p.warranty_months}${t('months')}`;
    } else {
      const typeLabel = p.type === 'lfp' ? t('battery_lfp') : p.type === 'lithium-ternary' ? t('battery_ternary') : t('battery_lead_acid');
      title = `${base} · ${typeLabel} · ${fmtDec1(p.capacity_kwh)}kWh · ${fmtDec1(p.discharge_rate)}C · ${fmtDec1(p.nominal_voltage)}V`;
      meta = `${t('bms_brand')}: ${p.bms_brand || '-'} · ${t('parallel_supported')}: ${Number(p.parallel_supported) ? t('yes') : t('no')} · ${t('warranty')}: ${p.warranty_months}${t('months')}`;
    }
    const status = p.sales_status === 'discontinued' ? 'discontinued' : 'on_sale';
    return `<div class="product-item">
      <h4>${title}<span class="status-badge ${status}">${t(status)}</span></h4>
      <div class="meta">${meta}</div>
      <div class="meta price-line">${money(p)}</div>
      <div class="row-actions">
        <button class="btn btn-secondary btn-sm edit-product" data-id="${p.id}">${t('edit_product')}</button>
        <button class="btn btn-danger del-product" data-id="${p.id}">${t('delete')}</button>
      </div>
    </div>`;
  }

  function bindProductActions() {
    document.querySelectorAll('#productList .edit-product').forEach((b) => {
      b.addEventListener('click', () => openProductModal(Number(b.dataset.id)));
    });
    document.querySelectorAll('#productList .del-product').forEach((b) => {
      b.addEventListener('click', () => deleteProduct(Number(b.dataset.id)));
    });
  }

  async function deleteProduct(id) {
    if (!confirm(t('confirm_delete'))) return;
    try {
      const { status } = await api(`/pv/api/products/${currentCategory}/${id}`, { method: 'DELETE' });
      showToast(status === 202 ? t('submitted_for_approval') : t('saved'));
      loadProducts();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  }

  document.getElementById('productCancel').addEventListener('click', closeProductModal);
  document.getElementById('productSave').addEventListener('click', saveProduct);

  function openProductModal(id) {
    editingProductId = id;
    document.getElementById('productModalTitle').textContent = id ? t('edit_product') : t('add_product');
    document.getElementById('productModalBody').innerHTML = buildProductForm();
    if (id) fillProductForm(id);
    const typeEl = document.getElementById('f_type');
    if (typeEl && document.getElementById('gridParallelField')) {
      typeEl.addEventListener('change', syncParallelFields);
      syncParallelFields();
    }
    document.getElementById('productModal').classList.add('active');
  }

  function syncParallelFields() {
    const typeEl = document.getElementById('f_type');
    const gridField = document.getElementById('gridParallelField');
    if (!typeEl || !gridField) return;
    const isHybrid = typeEl.value === 'hybrid';
    gridField.style.display = isHybrid ? '' : 'none';
    if (!isHybrid) {
      const gridInput = document.getElementById('f_grid_parallel_max');
      if (gridInput) gridInput.value = 1;
    }
  }

  function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
    editingProductId = null;
  }

  function buildProductForm() {
    let form = '';
    if (currentCategory === 'inverters') form = inverterForm();
    else if (currentCategory === 'panels') form = panelForm();
    else form = batteryForm();
    return form + `
      <div class="field"><label>${t('sales_status')}</label>
        <select id="f_sales_status">
          <option value="on_sale">${t('on_sale')}</option>
          <option value="discontinued">${t('discontinued')}</option>
        </select>
      </div>`;
  }

  function inverterForm() {
    return `
      <div class="field"><label>${t('brand')}</label><input id="f_brand" /></div>
      <div class="field"><label>${t('model')}</label><input id="f_model" maxlength="100" /></div>
      <div class="row">
        <div class="field"><label>${t('power')} (W)</label><input id="f_rated_power" type="number" min="1" step="1" /></div>
        <div class="field"><label>${t('mppt')}</label><input id="f_mppt" type="number" min="1" step="1" value="1" /></div>
      </div>
      <div class="row">
        <div class="field"><label>${t('mppt_max_current')} (A)</label><input id="f_mppt_current" type="number" min="0" step="0.1" /></div>
        <div class="field"><label>${t('mppt_max_voltage')} (V)</label><input id="f_mppt_voltage" type="number" min="0" step="1" /></div>
      </div>
      <div class="row">
        <div class="field"><label>${t('type')}</label>
          <select id="f_type"><option value="off-grid">${t('off_grid')}</option><option value="hybrid">${t('hybrid')}</option></select>
        </div>
        <div class="field"><label>${t('voltage')}</label>
          <select id="f_battery_voltage"><option value="12V">12V</option><option value="24V">24V</option><option value="48V">48V</option></select>
        </div>
      </div>
      <div class="row">
        <div class="field" id="gridParallelField"><label>${t('grid_parallel_max')}</label><input id="f_grid_parallel_max" type="number" min="1" value="1" /></div>
        <div class="field"><label>${t('offgrid_parallel_max')}</label><input id="f_offgrid_parallel_max" type="number" min="1" value="1" /></div>
      </div>
      <div class="select-note">${t('parallel_hint')}</div>
      <div class="field"><label>${t('grid_output_max_w')}</label><input id="f_grid_output_max_w" type="number" min="0" step="1" /><div class="select-note">${t('grid_output_hint')}</div></div>
      <div class="field"><label>${t('battery_less_start')}</label>
        <select id="f_battery_less"><option value="0">${t('no')}</option><option value="1">${t('yes')}</option></select>
        <div class="select-note">${t('battery_less_hint')}</div>
      </div>
      <div class="field"><label>${t('warranty')} (${t('months')})</label><input id="f_warranty" type="number" value="24" /></div>
      <div class="row">
        <div class="field"><label>${t('price_usd')}</label><input id="f_price_usd" type="number" step="0.01" /></div>
        <div class="field"><label>${t('price_khr')}</label><input id="f_price_khr" type="number" value="0" /></div>
      </div>`;
  }

  function panelForm() {
    return `
      <div class="field"><label>${t('brand')}</label><input id="f_brand" /></div>
      <div class="field"><label>${t('model')}</label><input id="f_model" maxlength="100" /></div>
      <div class="field"><label>${t('power')} (W)</label><input id="f_rated_power" type="number" /></div>
      <div class="field"><label>${t('dimensions')}</label>
        <div class="row">
          <input id="f_length" type="number" placeholder="${t('length')}" />
          <input id="f_width" type="number" placeholder="${t('width')}" />
          <input id="f_height" type="number" placeholder="${t('height')}" />
        </div>
      </div>
      <div class="row">
        <div class="field"><label>${t('voltage')} min</label><input id="f_vmin" type="number" step="0.1" /></div>
        <div class="field"><label>${t('voltage')} max</label><input id="f_vmax" type="number" step="0.1" /></div>
      </div>
      <div class="row">
        <div class="field"><label>${t('open_circuit_voltage')} Voc (V)</label><input id="f_voc" type="number" min="0" step="0.1" /></div>
        <div class="field"><label>${t('short_circuit_current')} Isc (A)</label><input id="f_isc" type="number" min="0" step="0.1" /></div>
      </div>
      <div class="field"><label>${t('type')}</label>
        <select id="f_glass"><option value="single">${t('single_glass')}</option><option value="double">${t('double_glass')}</option></select>
      </div>
      <div class="field"><label>${t('technology')}</label>
        <div class="chip-group" id="techChips">
          ${TECH_OPTIONS.map((opt) => `<span class="chip" data-tech="${opt}">${opt}</span>`).join('')}
        </div>
      </div>
      <div class="field"><label>${t('warranty')} (${t('months')})</label><input id="f_warranty" type="number" value="240" /></div>
      <div class="row">
        <div class="field"><label>${t('price_usd')}</label><input id="f_price_usd" type="number" step="0.01" /></div>
        <div class="field"><label>${t('price_khr')}</label><input id="f_price_khr" type="number" value="0" /></div>
      </div>`;
  }

  function batteryForm() {
    return `
      <div class="field"><label>${t('brand')}</label><input id="f_brand" /></div>
      <div class="field"><label>${t('model')}</label><input id="f_model" maxlength="100" /></div>
      <div class="row">
        <div class="field"><label>${t('capacity')} (kWh)</label><input id="f_capacity" type="number" step="0.01" /></div>
        <div class="field"><label>${t('voltage')} (V)</label><input id="f_voltage" type="number" step="0.1" value="48" /></div>
      </div>
      <div class="row">
        <div class="field"><label>${t('type')}</label>
          <select id="f_type">
            <option value="lead-acid">${t('battery_lead_acid')}</option>
            <option value="lfp">${t('battery_lfp')}</option>
            <option value="lithium-ternary">${t('battery_ternary')}</option>
          </select>
        </div>
        <div class="field"><label>${t('discharge_rate')} (C)</label><input id="f_discharge" type="number" step="0.01" min="0" value="0.5" /></div>
      </div>
      <div class="row">
        <div class="field"><label>${t('bms_brand')}</label><input id="f_bms" maxlength="100" /></div>
        <div class="field"><label>${t('parallel_supported')}</label>
          <select id="f_parallel">
            <option value="1">${t('yes')}</option>
            <option value="0">${t('no')}</option>
          </select>
        </div>
      </div>
      <div class="field"><label>${t('warranty')} (${t('months')})</label><input id="f_warranty" type="number" value="36" /></div>
      <div class="row">
        <div class="field"><label>${t('price_usd')}</label><input id="f_price_usd" type="number" step="0.01" /></div>
        <div class="field"><label>${t('price_khr')}</label><input id="f_price_khr" type="number" value="0" /></div>
      </div>`;
  }

  function fillProductForm(id) {
    const p = (productsCache[currentCategory] || []).find((x) => x.id === id);
    if (!p) return;
    const set = (fieldId, value) => {
      const el = document.getElementById(fieldId);
      if (el !== null && value !== undefined && value !== null) el.value = value;
    };
    set('f_brand', p.brand);
    set('f_model', p.model);
    set('f_price_usd', p.price_usd);
    set('f_price_khr', p.price_khr);
    set('f_warranty', p.warranty_months);
    set('f_sales_status', p.sales_status || 'on_sale');
    if (currentCategory === 'inverters') {
      set('f_rated_power', p.rated_power);
      set('f_mppt', p.mppt_channels);
      set('f_mppt_current', p.mppt_max_current_a === null || p.mppt_max_current_a === undefined ? null : fmtDec1(p.mppt_max_current_a));
      set('f_mppt_voltage', p.mppt_max_voltage_v === null || p.mppt_max_voltage_v === undefined ? null : fmtDec1(p.mppt_max_voltage_v));
      set('f_type', p.type);
      set('f_battery_voltage', p.battery_voltage);
      set('f_grid_parallel_max', p.grid_parallel_max || 1);
      set('f_offgrid_parallel_max', p.offgrid_parallel_max || 1);
      set('f_grid_output_max_w', p.grid_output_max_w === null || p.grid_output_max_w === undefined ? '' : p.grid_output_max_w);
      set('f_battery_less', Number(p.battery_less_start) ? '1' : '0');
    } else if (currentCategory === 'panels') {
      set('f_rated_power', p.rated_power);
      set('f_length', p.length_mm);
      set('f_width', p.width_mm);
      set('f_height', p.height_mm);
      set('f_vmin', p.voltage_min === null || p.voltage_min === undefined ? null : fmtDec1(p.voltage_min));
      set('f_vmax', p.voltage_max === null || p.voltage_max === undefined ? null : fmtDec1(p.voltage_max));
      set('f_voc', p.voc_v === null || p.voc_v === undefined ? null : fmtDec1(p.voc_v));
      set('f_isc', p.isc_a === null || p.isc_a === undefined ? null : fmtDec1(p.isc_a));
      set('f_glass', p.glass_type);
      const tech = Array.isArray(p.technology) ? p.technology : [];
      document.querySelectorAll('#techChips .chip').forEach((c) => {
        if (tech.includes(c.dataset.tech)) c.classList.add('selected');
      });
    } else {
      set('f_capacity', p.capacity_kwh);
      set('f_voltage', fmtDec1(p.nominal_voltage));
      set('f_type', p.type);
      set('f_discharge', p.discharge_rate);
      set('f_bms', p.bms_brand || '');
      set('f_parallel', Number(p.parallel_supported) ? '1' : '0');
    }
  }

  document.getElementById('productModalBody').addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('chip')) {
      e.target.classList.toggle('selected');
    }
  });

  function collectProduct() {
    const get = (id) => document.getElementById(id).value;
    const body = {
      brand: get('f_brand').trim(),
      model: get('f_model').trim(),
      warranty_months: Number(get('f_warranty')) || 0,
      price_usd: Number(get('f_price_usd')) || 0,
      price_khr: Number(get('f_price_khr')) || 0,
      sales_status: get('f_sales_status'),
    };
    if (currentCategory === 'inverters') {
      body.rated_power = Number(get('f_rated_power'));
      body.mppt_channels = Number(get('f_mppt')) || 1;
      body.mppt_max_current_a = get('f_mppt_current') === '' ? null : Number(get('f_mppt_current'));
      body.mppt_max_voltage_v = get('f_mppt_voltage') === '' ? null : Number(get('f_mppt_voltage'));
      body.type = get('f_type');
      body.battery_voltage = get('f_battery_voltage');
      body.grid_parallel_max = body.type === 'off-grid' ? 1 : Math.max(1, Number(get('f_grid_parallel_max')) || 1);
      body.offgrid_parallel_max = Math.max(1, Number(get('f_offgrid_parallel_max')) || 1);
      body.grid_output_max_w = get('f_grid_output_max_w') === '' ? null : Math.round(Number(get('f_grid_output_max_w')));
      body.battery_less_start = get('f_battery_less') === '1' ? 1 : 0;
    } else if (currentCategory === 'panels') {
      body.rated_power = Number(get('f_rated_power'));
      body.length_mm = get('f_length') === '' ? null : Number(get('f_length'));
      body.width_mm = get('f_width') === '' ? null : Number(get('f_width'));
      body.height_mm = get('f_height') === '' ? null : Number(get('f_height'));
      body.voltage_min = get('f_vmin') === '' ? null : Number(get('f_vmin'));
      body.voltage_max = get('f_vmax') === '' ? null : Number(get('f_vmax'));
      body.voc_v = get('f_voc') === '' ? null : Number(get('f_voc'));
      body.isc_a = get('f_isc') === '' ? null : Number(get('f_isc'));
      body.glass_type = get('f_glass');
      body.technology = Array.from(document.querySelectorAll('#techChips .chip.selected')).map((c) => c.dataset.tech);
    } else {
      body.capacity_kwh = Number(get('f_capacity'));
      body.nominal_voltage = Number(get('f_voltage')) || 48;
      body.type = get('f_type');
      body.discharge_rate = Number(get('f_discharge')) || 0.5;
      body.bms_brand = get('f_bms').trim() || null;
      body.parallel_supported = get('f_parallel') === '1' ? 1 : 0;
    }
    return body;
  }

  async function saveProduct() {
    const body = collectProduct();
    if (!body.brand) {
      showToast(t('required'), true);
      return;
    }
    const path = '/pv/api/products/' + currentCategory + (editingProductId ? '/' + editingProductId : '');
    const method = editingProductId ? 'PUT' : 'POST';
    try {
      const { status } = await api(path, { method, body });
      closeProductModal();
      showToast(status === 202 ? t('submitted_for_approval') : t('saved'));
      loadProducts();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  }

  /* ===================== Accounts ===================== */

  document.getElementById('accountCancel').addEventListener('click', closeAccountModal);
  document.getElementById('accountSave').addEventListener('click', saveAccount);

  async function loadAccounts() {
    updateAccountHint();
    const list = document.getElementById('accountList');
    list.innerHTML = `<div class="card empty-state">${t('loading')}</div>`;
    try {
      const path = me.role === 'super_admin' ? '/pv/api/admin/users' : '/pv/api/admin/users/subordinates';
      const { data } = await api(path);
      accountsCache = data;
      accountsLoaded = true;
      renderAccounts();
    } catch (e) {
      list.innerHTML = `<div class="card empty-state">${errMsg(e)}</div>`;
    }
  }

  function updateAccountHint() {
    const hint = document.getElementById('accountHint');
    if (me.role === 'sales_manager') {
      hint.textContent = t('account_needs_approval');
      hint.style.display = '';
    } else {
      hint.textContent = '';
      hint.style.display = 'none';
    }
  }

  // Re-render from the cached list so switching language never hits the API again.
  function renderAccounts() {
    renderAccountFilters();
    renderAccountList();
  }

  function matchesAccount(u) {
    const kw = accountFilters.keyword.trim().toLowerCase();
    if (accountFilters.role && u.role !== accountFilters.role) return false;
    if (accountFilters.status && u.status !== accountFilters.status) return false;
    if (!kw) return true;
    const text = [u.username, u.email, u.phone, u.full_name, u.manager_username].filter(Boolean).join(' ').toLowerCase();
    return text.indexOf(kw) !== -1;
  }

  function renderAccountFilters() {
    const bar = document.getElementById('accountFilters');
    bar.innerHTML = `
      <div class="filter-field">
        <label>${escapeHtml(t('account_keyword'))}</label>
        <input id="acc_kw" value="${escapeHtml(accountFilters.keyword)}" placeholder="${escapeHtml(t('search_accounts'))}" />
      </div>
      <div class="filter-field">
        <label>${escapeHtml(t('role'))}</label>
        <select id="acc_role">
          <option value="">${escapeHtml(t('filter_all'))}</option>
          <option value="super_admin" ${accountFilters.role === 'super_admin' ? 'selected' : ''}>${escapeHtml(t('role_super_admin'))}</option>
          <option value="sales_manager" ${accountFilters.role === 'sales_manager' ? 'selected' : ''}>${escapeHtml(t('role_sales_manager'))}</option>
          <option value="salesperson" ${accountFilters.role === 'salesperson' ? 'selected' : ''}>${escapeHtml(t('role_salesperson'))}</option>
        </select>
      </div>
      <div class="filter-field">
        <label>${escapeHtml(t('status'))}</label>
        <select id="acc_status">
          <option value="">${escapeHtml(t('filter_all'))}</option>
          <option value="active" ${accountFilters.status === 'active' ? 'selected' : ''}>${escapeHtml(t('status_active'))}</option>
          <option value="disabled" ${accountFilters.status === 'disabled' ? 'selected' : ''}>${escapeHtml(t('status_disabled'))}</option>
        </select>
      </div>
      <div class="filter-footer">
        <button type="button" class="btn btn-primary btn-sm btn-add" id="addAccountBtn">${escapeHtml(t('add_account'))}</button>
        <div class="filter-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="accReset">${escapeHtml(t('reset_filters'))}</button>
          <button type="button" class="btn btn-primary btn-sm" id="accSearch">${escapeHtml(t('search'))}</button>
        </div>
      </div>`;
    document.getElementById('addAccountBtn').addEventListener('click', () => openAccountModal(null));
    document.getElementById('accSearch').addEventListener('click', () => {
      accountFilters = {
        keyword: document.getElementById('acc_kw').value,
        role: document.getElementById('acc_role').value,
        status: document.getElementById('acc_status').value,
      };
      accountPage = 1;
      renderAccountList();
    });
    document.getElementById('accReset').addEventListener('click', () => {
      accountFilters = { keyword: '', role: '', status: '' };
      accountPage = 1;
      renderAccountFilters();
      renderAccountList();
    });
    document.getElementById('acc_kw').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('accSearch').click();
      }
    });
  }

  function renderAccountList() {
    const list = document.getElementById('accountList');
    if (!accountsLoaded) return;
    const filtered = accountsCache.filter(matchesAccount);
    if (!filtered.length) {
      list.innerHTML = `<div class="card empty-state">${t('no_accounts')}</div>`;
      return;
    }
    const pageSize = ProductCatalog.PAGE_SIZE;
    const pageCount = Math.ceil(filtered.length / pageSize);
    if (accountPage > pageCount) accountPage = pageCount;
    if (accountPage < 1) accountPage = 1;
    const shown = filtered.slice((accountPage - 1) * pageSize, accountPage * pageSize);
    list.innerHTML = shown.map(renderAccount).join('') + ProductCatalog.pagerHtml(accountPage, pageCount, t);
    bindAccountActions();
    ProductCatalog.bindPager(list, (page) => {
      accountPage = page;
      renderAccountList();
    });
  }

  function renderAccount(u) {
    const metaParts = [];
    if (u.email) metaParts.push(u.email);
    if (u.phone) metaParts.push(u.phone);
    if (u.role === 'salesperson') {
      metaParts.push(t('manager') + ': ' + (u.manager_username || t('super_admin_default')));
    }
    const status = u.status === 'disabled' ? 'disabled' : 'active';
    return `<div class="product-item account-item">
      <h4>${u.username}<span class="role-badge role-${u.role}">${t('role_' + u.role)}</span>
        <span class="status-badge ${status === 'disabled' ? 'discontinued' : 'on_sale'}">${t(status === 'disabled' ? 'status_disabled' : 'status_active')}</span>
      </h4>
      <div class="meta">${metaParts.join(' · ') || '-'}</div>
      <div class="row-actions">
        <button class="btn btn-secondary btn-sm edit-account" data-id="${u.id}">${t('edit_account')}</button>
        <button class="btn btn-danger del-account" data-id="${u.id}">${t('delete')}</button>
      </div>
    </div>`;
  }

  function bindAccountActions() {
    document.querySelectorAll('#accountList .edit-account').forEach((b) => {
      b.addEventListener('click', () => openAccountModal(Number(b.dataset.id)));
    });
    document.querySelectorAll('#accountList .del-account').forEach((b) => {
      b.addEventListener('click', () => deleteAccount(Number(b.dataset.id)));
    });
  }

  async function deleteAccount(id) {
    if (!confirm(t('confirm_delete_account'))) return;
    const isSuper = me.role === 'super_admin';
    const path = isSuper ? '/pv/api/admin/users/' + id : '/pv/api/admin/users/subordinates/' + id;
    try {
      const { status } = await api(path, { method: 'DELETE' });
      showToast(status === 202 ? t('submitted_for_approval') : t('saved'));
      loadAccounts();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  }

  function openAccountModal(id) {
    editingAccountId = id;
    const isSuper = me.role === 'super_admin';
    document.getElementById('accountModalTitle').textContent = id ? t('edit_account') : t('add_account');

    const user = id ? accountsCache.find((u) => u.id === id) : null;
    const managers = accountsCache.filter((u) => u.role === 'sales_manager');

    let roleControl = '';
    if (isSuper && !id) {
      roleControl = `
        <div class="field"><label>${t('role')}</label>
          <select id="a_role" data-onchange="role">
            <option value="salesperson">${t('role_salesperson')}</option>
            <option value="sales_manager">${t('role_sales_manager')}</option>
          </select>
        </div>`;
    }

    let managerControl = '';
    if (isSuper) {
      managerControl = `
        <div class="field" id="managerField"><label>${t('manager')}</label>
          <select id="a_manager">
            <option value="">${t('super_admin_default')}</option>
            ${managers.map((m) => `<option value="${m.id}">${m.username}</option>`).join('')}
          </select>
        </div>`;
    }

    let statusControl = '';
    if (id) {
      statusControl = `
        <div class="field"><label>${t('status')}</label>
          <select id="a_status">
            <option value="active">${t('status_active')}</option>
            <option value="disabled">${t('status_disabled')}</option>
          </select>
        </div>`;
    }

    document.getElementById('accountModalBody').innerHTML = `
      <div class="field"><label>${t('username')}</label><input id="a_username" value="${user ? user.username : ''}" /></div>
      <div class="field"><label>${t('email')}</label><input id="a_email" type="email" value="${user && user.email ? user.email : ''}" /></div>
      <div class="field"><label>${t('phone')}</label><input id="a_phone" value="${user && user.phone ? user.phone : ''}" /></div>
      ${roleControl}
      ${managerControl}
      ${statusControl}
      <div class="field"><label>${id ? t('password_optional') : t('password')}</label><input id="a_password" type="password" /></div>
    `;

    if (user) {
      if (isSuper && document.getElementById('a_manager')) {
        document.getElementById('a_manager').value = user.manager_id ? String(user.manager_id) : '';
      }
      if (document.getElementById('a_status')) {
        document.getElementById('a_status').value = user.status === 'disabled' ? 'disabled' : 'active';
      }
      if (isSuper && document.getElementById('managerField')) {
        document.getElementById('managerField').style.display = user.role === 'salesperson' ? '' : 'none';
      }
    }

    const roleSelect = document.getElementById('a_role');
    if (roleSelect) {
      roleSelect.addEventListener('change', () => {
        const managerField = document.getElementById('managerField');
        if (managerField) managerField.style.display = roleSelect.value === 'salesperson' ? '' : 'none';
      });
    }

    document.getElementById('accountModal').classList.add('active');
  }

  function closeAccountModal() {
    document.getElementById('accountModal').classList.remove('active');
    editingAccountId = null;
  }

  async function saveAccount() {
    const get = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    const username = get('a_username').trim();
    const email = get('a_email').trim();
    const phone = get('a_phone').trim();
    const password = get('a_password');
    const role = get('a_role') || (editingAccountId ? (accountsCache.find((u) => u.id === editingAccountId) || {}).role : null) || 'salesperson';
    const managerId = get('a_manager');
    const status = get('a_status');

    if (!username) {
      showToast(t('required'), true);
      return;
    }
    if (!editingAccountId && !password) {
      showToast(t('password'), true);
      return;
    }

    const isSuper = me.role === 'super_admin';
    const body = { username, email, phone };
    if (password) body.password = password;
    if (status) body.status = status;

    let path;
    let method;
    if (isSuper) {
      if (editingAccountId) {
        path = '/pv/api/admin/users/' + editingAccountId;
        method = 'PUT';
      } else {
        path = '/pv/api/admin/users';
        method = 'POST';
        body.role = role;
      }
      if (role === 'salesperson') body.manager_id = managerId ? Number(managerId) : null;
    } else {
      path = editingAccountId
        ? '/pv/api/admin/users/subordinates/' + editingAccountId
        : '/pv/api/admin/users/subordinates';
      method = editingAccountId ? 'PUT' : 'POST';
    }

    try {
      const { status: httpStatus } = await api(path, { method, body });
      closeAccountModal();
      showToast(httpStatus === 202 ? t('submitted_for_approval') : t('saved'));
      loadAccounts();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  }

  /* ===================== Approvals ===================== */

  document.querySelectorAll('#approvalScopeTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#approvalScopeTabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      approvalScope = btn.dataset.scope;
      approvalPage = 1;
      loadApprovals();
    });
  });

  function canReview(a) {
    if (a.status !== 'pending') return false;
    if (me.role === 'super_admin') return true;
    if (me.role === 'sales_manager') {
      if (a.request_type === 'account_register') {
        return a.approver_role === 'sales_manager' && Number(a.approver_id) === Number(me.id);
      }
      return a.approver_role === 'sales_manager'
        && String(a.request_type).startsWith('product_')
        && Number(a.requester_id) !== Number(me.id);
    }
    return false;
  }

  async function loadApprovals() {
    const tabs = document.getElementById('approvalScopeTabs');
    tabs.style.display = me.role === 'salesperson' ? 'none' : '';
    const scope = me.role === 'salesperson' ? 'mine' : approvalScope;
    const list = document.getElementById('approvalList');
    list.innerHTML = `<div class="card empty-state">${t('loading')}</div>`;
    try {
      const { data } = await api('/pv/api/approvals?scope=' + scope);
      approvalsCache = data;
      approvalsLoaded = true;
      renderApprovals();
    } catch (e) {
      list.innerHTML = `<div class="card empty-state">${errMsg(e)}</div>`;
    }
  }

  // Re-render from cache so a language switch does not refetch approvals.
  function renderApprovals() {
    renderApprovalFilters();
    renderApprovalList();
  }

  function matchesApproval(a) {
    if (approvalFilters.type && a.request_type !== approvalFilters.type) return false;
    if (approvalFilters.status && a.status !== approvalFilters.status) return false;
    return true;
  }

  function renderApprovalFilters() {
    const bar = document.getElementById('approvalFilters');
    const types = [
      'product_create',
      'product_update',
      'product_delete',
      'account_create',
      'account_update',
      'account_delete',
      'account_register',
    ];
    bar.innerHTML = `
      <div class="filter-field">
        <label>${escapeHtml(t('request_type'))}</label>
        <select id="ap_type">
          <option value="">${escapeHtml(t('filter_all'))}</option>
          ${types.map((type) => `<option value="${type}" ${approvalFilters.type === type ? 'selected' : ''}>${escapeHtml(requestTypeLabel(type))}</option>`).join('')}
        </select>
      </div>
      <div class="filter-field">
        <label>${escapeHtml(t('status'))}</label>
        <select id="ap_status">
          <option value="">${escapeHtml(t('filter_all'))}</option>
          <option value="pending" ${approvalFilters.status === 'pending' ? 'selected' : ''}>${escapeHtml(t('pending'))}</option>
          <option value="approved" ${approvalFilters.status === 'approved' ? 'selected' : ''}>${escapeHtml(t('approved'))}</option>
          <option value="rejected" ${approvalFilters.status === 'rejected' ? 'selected' : ''}>${escapeHtml(t('rejected'))}</option>
          <option value="cancelled" ${approvalFilters.status === 'cancelled' ? 'selected' : ''}>${escapeHtml(t('cancelled'))}</option>
        </select>
      </div>
      <div class="filter-field filter-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="apReset">${escapeHtml(t('reset_filters'))}</button>
        <button type="button" class="btn btn-primary btn-sm" id="apSearch">${escapeHtml(t('search'))}</button>
      </div>`;
    document.getElementById('apSearch').addEventListener('click', () => {
      approvalFilters = {
        type: document.getElementById('ap_type').value,
        status: document.getElementById('ap_status').value,
      };
      approvalPage = 1;
      renderApprovalList();
    });
    document.getElementById('apReset').addEventListener('click', () => {
      approvalFilters = { type: '', status: '' };
      approvalPage = 1;
      renderApprovalFilters();
      renderApprovalList();
    });
  }

  function renderApprovalList() {
    const list = document.getElementById('approvalList');
    if (!approvalsLoaded) return;
    const filtered = approvalsCache.filter(matchesApproval);
    if (!filtered.length) {
      list.innerHTML = `<div class="card empty-state">${t('no_approvals')}</div>`;
      return;
    }
    const pageSize = ProductCatalog.PAGE_SIZE;
    const pageCount = Math.ceil(filtered.length / pageSize);
    if (approvalPage > pageCount) approvalPage = pageCount;
    if (approvalPage < 1) approvalPage = 1;
    const shown = filtered.slice((approvalPage - 1) * pageSize, approvalPage * pageSize);
    list.innerHTML = shown.map(renderApproval).join('') + ProductCatalog.pagerHtml(approvalPage, pageCount, t);
    bindApprovalActions();
    ProductCatalog.bindPager(list, (page) => {
      approvalPage = page;
      renderApprovalList();
    });
  }

  function renderApproval(a) {
    const p = payload(a);
    let detail = '';
    if (String(a.request_type).startsWith('product_')) {
      detail = [`${p.brand || ''}${p.model ? ' ' + p.model : ''}`, p.rated_power ? p.rated_power + 'W' : '', p.mppt_channels ? 'MPPT×' + p.mppt_channels : '', p.mppt_max_current_a ? fmtDec1(p.mppt_max_current_a) + 'A' : '', p.mppt_max_voltage_v ? fmtDec1(p.mppt_max_voltage_v) + 'V' : '', p.voc_v ? 'Voc ' + fmtDec1(p.voc_v) + 'V' : '', p.isc_a ? 'Isc ' + fmtDec1(p.isc_a) + 'A' : '', p.capacity_kwh ? p.capacity_kwh + 'kWh' : '', p.price_usd ? '$' + p.price_usd : '']
        .filter(Boolean).join(' · ');
    } else if (a.request_type === 'account_register') {
      detail = [p.username, p.email, p.phone, p.role ? t('role_' + p.role) : ''].filter(Boolean).join(' · ');
    } else {
      detail = [p.username, p.email, p.phone].filter(Boolean).join(' · ');
    }
    const canAct = canReview(a);
    const isMine = Number(a.requester_id) === Number(me.id) && a.status === 'pending';
    return `<div class="product-item approval-item approval-${a.status}">
      <h4>${requestTypeLabel(a.request_type)}
        <span class="status-badge approval-badge ${a.status}">${statusLabel(a.status)}</span>
      </h4>
      <div class="meta">${t('requester')}: ${a.requester_username} · ${new Date(a.created_at).toLocaleString()}</div>
      ${detail ? `<div class="meta">${detail}</div>` : ''}
      ${a.reason ? `<div class="meta">${t('request_reason')}: ${a.reason}</div>` : ''}
      ${a.review_note ? `<div class="meta">${t('review_note')}: ${a.review_note}</div>` : ''}
      ${a.approver_username ? `<div class="meta">${t('reviewer')}: ${a.approver_username}</div>` : ''}
      <div class="row-actions">
        ${canAct ? `<button class="btn btn-primary btn-sm approve-btn" data-id="${a.id}">${t('approve')}</button>` : ''}
        ${canAct ? `<button class="btn btn-danger reject-btn" data-id="${a.id}">${t('reject')}</button>` : ''}
        ${isMine ? `<button class="btn btn-secondary btn-sm cancel-btn" data-id="${a.id}">${t('cancel_request')}</button>` : ''}
      </div>
    </div>`;
  }

  function bindApprovalActions() {
    document.querySelectorAll('#approvalList .approve-btn').forEach((b) => {
      b.addEventListener('click', () => approveRequest(Number(b.dataset.id)));
    });
    document.querySelectorAll('#approvalList .reject-btn').forEach((b) => {
      b.addEventListener('click', () => openReviewModal(Number(b.dataset.id)));
    });
    document.querySelectorAll('#approvalList .cancel-btn').forEach((b) => {
      b.addEventListener('click', () => cancelRequest(Number(b.dataset.id)));
    });
  }

  async function approveRequest(id) {
    try {
      await api('/pv/api/approvals/' + id + '/approve', { method: 'POST' });
      showToast(t('approved'));
      loadApprovals();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  }

  async function cancelRequest(id) {
    if (!confirm(t('confirm_cancel_request'))) return;
    try {
      await api('/pv/api/approvals/' + id + '/cancel', { method: 'POST' });
      showToast(t('cancelled'));
      loadApprovals();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  }

  function openReviewModal(id) {
    rejectApprovalId = id;
    document.getElementById('reviewNote').value = '';
    document.getElementById('reviewModal').classList.add('active');
  }

  document.getElementById('reviewCancel').addEventListener('click', () => {
    document.getElementById('reviewModal').classList.remove('active');
    rejectApprovalId = null;
  });

  document.getElementById('reviewConfirm').addEventListener('click', async () => {
    const note = document.getElementById('reviewNote').value.trim();
    if (!note) {
      showToast(t('review_note_required'), true);
      return;
    }
    try {
      await api('/pv/api/approvals/' + rejectApprovalId + '/reject', {
        method: 'POST',
        body: { review_note: note },
      });
      document.getElementById('reviewModal').classList.remove('active');
      rejectApprovalId = null;
      showToast(t('rejected'));
      loadApprovals();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  });

  /* ===================== Approval flows ===================== */

  const FLOW_REQUEST_TYPES = [
    'product_create',
    'product_update',
    'product_delete',
    'account_create',
    'account_update',
    'account_delete',
    'account_register',
  ];

  document.getElementById('addFlowBtn').addEventListener('click', () => openFlowModal(null));
  document.getElementById('flowCancel').addEventListener('click', closeFlowModal);
  document.getElementById('flowSave').addEventListener('click', saveFlow);

  async function loadFlows() {
    const list = document.getElementById('flowList');
    list.innerHTML = `<div class="card empty-state">${t('loading')}</div>`;
    try {
      const { data } = await api('/pv/api/admin/flows');
      flowsCache = Array.isArray(data) ? data : [];
      renderFlows();
    } catch (e) {
      list.innerHTML = `<div class="card empty-state">${errMsg(e)}</div>`;
    }
  }

  function renderFlows() {
    const list = document.getElementById('flowList');
    if (!flowsCache.length) {
      list.innerHTML = `<div class="card empty-state">${t('no_flows')}</div>`;
      return;
    }
    list.innerHTML = flowsCache.map(renderFlow).join('');
    bindFlowActions();
  }

  function renderFlow(f) {
    const enabled = Number(f.enabled) === 1;
    return `<div class="product-item">
      <h4>${escapeHtml(f.name)}
        <span class="status-badge ${enabled ? 'on_sale' : 'discontinued'}">${t(enabled ? 'status_active' : 'status_disabled')}</span>
      </h4>
      <div class="meta">${requestTypeLabel(f.request_type)} · ${t('requester_role')}: ${t('role_' + f.requester_role)} · ${t('approver_role')}: ${t('role_' + f.approver_role)}</div>
      <div class="meta">${t('require_approval')}: ${Number(f.require_approval) ? t('yes') : t('no')}</div>
      <div class="row-actions">
        <button class="btn btn-secondary btn-sm edit-flow" data-id="${f.id}">${t('edit_flow')}</button>
        <button class="btn btn-danger del-flow" data-id="${f.id}">${t('delete')}</button>
      </div>
    </div>`;
  }

  function bindFlowActions() {
    document.querySelectorAll('#flowList .edit-flow').forEach((b) => {
      b.addEventListener('click', () => openFlowModal(Number(b.dataset.id)));
    });
    document.querySelectorAll('#flowList .del-flow').forEach((b) => {
      b.addEventListener('click', () => deleteFlow(Number(b.dataset.id)));
    });
  }

  async function deleteFlow(id) {
    if (!confirm(t('confirm_delete_flow'))) return;
    try {
      await api('/pv/api/admin/flows/' + id, { method: 'DELETE' });
      showToast(t('saved'));
      loadFlows();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  }

  function openFlowModal(id) {
    editingFlowId = id;
    const flow = id ? flowsCache.find((f) => Number(f.id) === id) : null;
    document.getElementById('flowModalTitle').textContent = id ? t('edit_flow') : t('add_flow');
    document.getElementById('flowModalBody').innerHTML = `
      <div class="field"><label>${t('flow_name')}</label>
        <input id="fl_name" maxlength="100" value="${flow ? escapeHtml(flow.name) : ''}" placeholder="${t('flow_name_placeholder')}" /></div>
      <div class="field"><label>${t('request_type')}</label>
        <select id="fl_request_type">
          ${FLOW_REQUEST_TYPES.map((type) => `<option value="${type}" ${flow && flow.request_type === type ? 'selected' : ''}>${requestTypeLabel(type)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>${t('requester_role')}</label>
        <select id="fl_requester_role">
          <option value="salesperson" ${flow && flow.requester_role === 'salesperson' ? 'selected' : ''}>${t('role_salesperson')}</option>
          <option value="sales_manager" ${flow && flow.requester_role === 'sales_manager' ? 'selected' : ''}>${t('role_sales_manager')}</option>
        </select>
      </div>
      <div class="field"><label>${t('approver_role')}</label>
        <select id="fl_approver_role">
          <option value="sales_manager" ${flow && flow.approver_role === 'sales_manager' ? 'selected' : ''}>${t('role_sales_manager')}</option>
          <option value="super_admin" ${flow && flow.approver_role === 'super_admin' ? 'selected' : ''}>${t('role_super_admin')}</option>
        </select>
        <div class="select-note">${t('approver_sales_manager_hint')}</div>
      </div>
      <div class="field"><label>${t('require_approval')}</label>
        <select id="fl_require_approval">
          <option value="1" ${!flow || Number(flow.require_approval) ? 'selected' : ''}>${t('yes')}</option>
          <option value="0" ${flow && !Number(flow.require_approval) ? 'selected' : ''}>${t('no')}</option>
        </select>
      </div>
      <div class="field"><label>${t('status')}</label>
        <select id="fl_enabled">
          <option value="1" ${!flow || Number(flow.enabled) ? 'selected' : ''}>${t('status_active')}</option>
          <option value="0" ${flow && !Number(flow.enabled) ? 'selected' : ''}>${t('status_disabled')}</option>
        </select>
      </div>`;
    document.getElementById('flowModal').classList.add('active');
  }

  function closeFlowModal() {
    document.getElementById('flowModal').classList.remove('active');
    editingFlowId = null;
  }

  async function saveFlow() {
    const body = {
      name: document.getElementById('fl_name').value.trim(),
      request_type: document.getElementById('fl_request_type').value,
      requester_role: document.getElementById('fl_requester_role').value,
      approver_role: document.getElementById('fl_approver_role').value,
      require_approval: Number(document.getElementById('fl_require_approval').value),
      enabled: Number(document.getElementById('fl_enabled').value),
    };
    if (!body.name) {
      showToast(t('required'), true);
      return;
    }
    try {
      if (editingFlowId) {
        await api('/pv/api/admin/flows/' + editingFlowId, { method: 'PUT', body });
      } else {
        await api('/pv/api/admin/flows', { method: 'POST', body });
      }
      closeFlowModal();
      showToast(t('saved'));
      loadFlows();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  }

  /* ===================== Settings ===================== */

  async function loadSettings() {
    const panel = document.getElementById('settingsPanel');
    panel.innerHTML = `<div class="card empty-state">${t('loading')}</div>`;
    try {
      const { data } = await api('/pv/api/config', { auth: false });
      settingsCache = data;
      renderSettings();
    } catch (e) {
      panel.innerHTML = `<div class="card empty-state">${t('error')}</div>`;
    }
  }

  // Re-render the settings form from cache on language change.
  function renderSettings() {
    if (!settingsCache) return;
    const panel = document.getElementById('settingsPanel');
    const data = settingsCache;
    panel.innerHTML = `
        <div class="card">
          <div class="field"><label>${t('peak_sun_hours')}</label>
            <input id="s_psh" type="number" step="0.1" value="${data.default_peak_sun_hours || 5}" /></div>
          <div class="field"><label>${t('default_currency')}</label>
            <select id="s_currency">
              <option value="USD" ${data.default_currency === 'USD' ? 'selected' : ''}>USD</option>
              <option value="KHR" ${data.default_currency === 'KHR' ? 'selected' : ''}>KHR</option>
            </select>
          </div>
          <div class="field"><label>${t('usd_to_khr')}</label>
            <input id="s_rate" type="number" value="${data.usd_to_khr || 4100}" /></div>
          <div class="row">
            <div class="field"><label>${t('installation_fee_percent')}</label>
              <input id="s_install_pct" type="number" step="0.1" value="${data.installation_fee_percent || 20}" /></div>
            <div class="field"><label>${t('installation_fee_min_usd')}</label>
              <input id="s_install_min" type="number" step="1" value="${data.installation_fee_min_usd || 500}" /></div>
          </div>
          <div class="row">
            <div class="field"><label>${t('battery_price_lfp_per_kwh')}</label>
              <input id="s_batt_lfp" type="number" step="1" value="${data.battery_price_lfp_per_kwh || 120}" /></div>
            <div class="field"><label>${t('battery_price_ternary_per_kwh')}</label>
              <input id="s_batt_ternary" type="number" step="1" value="${data.battery_price_ternary_per_kwh || 120}" /></div>
          </div>
          <div class="field"><label>${t('battery_price_lead_acid_per_kwh')}</label>
            <input id="s_batt_lead" type="number" step="1" value="${data.battery_price_lead_acid_per_kwh || 85}" /></div>
          <button class="btn btn-primary" id="saveSettings">${t('save_settings')}</button>
        </div>`;
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
  }

  async function saveSettings() {
    const updates = {
      default_peak_sun_hours: document.getElementById('s_psh').value,
      default_currency: document.getElementById('s_currency').value,
      usd_to_khr: document.getElementById('s_rate').value,
      installation_fee_percent: document.getElementById('s_install_pct').value,
      installation_fee_min_usd: document.getElementById('s_install_min').value,
      battery_price_lfp_per_kwh: document.getElementById('s_batt_lfp').value,
      battery_price_ternary_per_kwh: document.getElementById('s_batt_ternary').value,
      battery_price_lead_acid_per_kwh: document.getElementById('s_batt_lead').value,
    };
    try {
      await api('/pv/api/config', { method: 'PUT', body: { updates } });
      showToast(t('saved'));
    } catch (e) {
      showToast(errMsg(e), true);
    }
  }

  /* ===================== Language / bootstrap ===================== */

  function initLang() {
    const lang = getCurrentLang();
    if (window.updateLangPicker) window.updateLangPicker(lang);
    applyLang();
  }

  document.addEventListener('lang:change', (e) => {
    // Re-render only after the new dictionary file has been loaded client-side.
    setLang(e.detail.lang).then(() => {
      initLang();
      if (!me) return;
      document.getElementById('userRoleBadge').textContent = t('role_' + me.role);
      // Every page keeps its data in memory, so a language switch only re-renders
      // text from the in-browser dictionary and never calls the API again.
      if (currentTab === 'products') {
        updateProductHint();
        if (productsCache[currentCategory]) {
          renderProductFilters();
          renderProductList();
        }
      } else if (currentTab === 'accounts') {
        if (accountsLoaded) {
          updateAccountHint();
          renderAccounts();
        }
      } else if (currentTab === 'approvals') {
        if (approvalsLoaded) renderApprovals();
      } else if (currentTab === 'flows') {
        renderFlows();
      } else if (currentTab === 'settings') {
        renderSettings();
      }
    });
  });

  async function bootstrap() {
    // Render only after the dictionary is in memory (IndexedDB-backed).
    await window.I18N_READY;
    initLang();
    setAuthMode('login');
    try {
      const { data } = await api('/pv/api/config/countries', { auth: false });
      countries = Array.isArray(data.countries) ? data.countries : [];
    } catch (e) {
      countries = [];
    }
    if (!countries.length) countries = [{ code: 'KH', dial: '855', name: 'Cambodia' }];
    fillPhoneCountries();
    const user = await loadMe();
    if (user) showPanel();
  }

  if (document.readyState === 'complete') {
    bootstrap();
  } else {
    window.addEventListener('load', bootstrap);
  }
})();
