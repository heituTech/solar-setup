// Admin page logic
(function () {
  let adminToken = localStorage.getItem('admin_token') === '1';
  let currentTab = 'inverters';
  let editingId = null;

  const TAB_ENDPOINT = {
    inverters: '/api/products/inverters',
    panels: '/api/products/panels',
    batteries: '/api/products/batteries',
  };

  const TECH_OPTIONS = ['N type', 'P type', 'Topcon', 'HTJ', 'BC'];

  /* ===================== Auth ===================== */
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const pwd = document.getElementById('adminPwd').value;
    try {
      const r = await fetch('/api/config/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      if (r.ok) {
        adminToken = true;
        localStorage.setItem('admin_token', '1');
        showPanel();
      } else {
        showToast(t('error'), true);
      }
    } catch (e) {
      showToast(t('error'), true);
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    adminToken = false;
    localStorage.removeItem('admin_token');
    document.getElementById('loginBox').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
  });

  function showPanel() {
    document.getElementById('loginBox').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    loadTab(currentTab);
  }

  /* ===================== Tabs ===================== */
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      if (currentTab === 'settings') {
        document.getElementById('productList').style.display = 'none';
        document.getElementById('settingsPanel').style.display = 'block';
        document.getElementById('addBtn').style.display = 'none';
        loadSettings();
      } else {
        document.getElementById('productList').style.display = 'block';
        document.getElementById('settingsPanel').style.display = 'none';
        document.getElementById('addBtn').style.display = 'inline-flex';
        loadTab(currentTab);
      }
    });
  });

  /* ===================== Product list ===================== */
  async function loadTab(tab) {
    const list = document.getElementById('productList');
    list.innerHTML = '<div class="empty-state">...</div>';
    try {
      const r = await fetch(TAB_ENDPOINT[tab]);
      const data = await r.json();
      if (!data.length) {
        list.innerHTML = `<div class="card empty-state">${t('no_data')}</div>`;
        return;
      }
      list.innerHTML = data.map(renderItem).join('');
      bindItemActions();
    } catch (e) {
      list.innerHTML = `<div class="card empty-state">${t('error')}</div>`;
    }
  }

  function renderItem(p) {
    let meta = '';
    if (currentTab === 'inverters') {
      meta = `${t('power')}: ${p.rated_power}W · ${p.type} · ${p.battery_voltage} · MPPT×${p.mppt_channels} · ${t('warranty')}: ${p.warranty_months}${t('months')}`;
    } else if (currentTab === 'panels') {
      const tech = Array.isArray(p.technology) ? p.technology.join('/') : '';
      meta = `${t('power')}: ${p.rated_power}W · ${p.glass_type === 'double' ? t('double_glass') : t('single_glass')}${tech ? ' · ' + tech : ''} · ${t('warranty')}: ${p.warranty_months}${t('months')}`;
    } else {
      meta = `${t('capacity')}: ${p.capacity_kwh}kWh · ${p.type} · ${p.nominal_voltage}V · ${p.discharge_rate}C · ${t('warranty')}: ${p.warranty_months}${t('months')}`;
    }
    const price = p.price_khr > 0
      ? `$${Number(p.price_usd).toLocaleString()} / ${Number(p.price_khr).toLocaleString()}KHR`
      : `$${Number(p.price_usd).toLocaleString()}`;
    return `<div class="product-item" data-id="${p.id}">
      <h4>${p.brand}</h4>
      <div class="meta">${meta}</div>
      <div class="meta" style="color:var(--primary-dark);font-weight:600;margin-top:4px">${price}</div>
      <div class="row-actions">
        <button class="btn btn-secondary btn-sm edit-btn" data-id="${p.id}" data-i18n="edit_product">${t('edit_product')}</button>
        <button class="btn btn-danger del-btn" data-id="${p.id}" data-i18n="delete">${t('delete')}</button>
      </div>
    </div>`;
  }

  function bindItemActions() {
    document.querySelectorAll('.edit-btn').forEach((b) => {
      b.addEventListener('click', () => openModal(Number(b.dataset.id)));
    });
    document.querySelectorAll('.del-btn').forEach((b) => {
      b.addEventListener('click', () => deleteItem(Number(b.dataset.id)));
    });
  }

  async function deleteItem(id) {
    if (!confirm(t('confirm_delete'))) return;
    try {
      await fetch(`${TAB_ENDPOINT[currentTab]}/${id}`, { method: 'DELETE' });
      loadTab(currentTab);
      showToast(t('saved'));
    } catch (e) {
      showToast(t('error'), true);
    }
  }

  /* ===================== Modal / Form ===================== */
  document.getElementById('addBtn').addEventListener('click', () => openModal(null));
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', saveItem);

  function openModal(id) {
    editingId = id;
    document.getElementById('modalTitle').textContent = id ? t('edit_product') : t('add_product');
    const body = document.getElementById('modalBody');
    body.innerHTML = buildForm();
    if (id) loadItemForEdit(id);
    document.getElementById('modal').classList.add('active');
  }

  function closeModal() {
    document.getElementById('modal').classList.remove('active');
    editingId = null;
  }

  function buildForm() {
    if (currentTab === 'inverters') return inverterForm();
    if (currentTab === 'panels') return panelForm();
    return batteryForm();
  }

  function inverterForm() {
    return `
      <div class="field"><label>${t('brand')}</label><input id="f_brand" required /></div>
      <div class="row">
        <div class="field"><label>${t('power')} (W)</label><input id="f_rated_power" type="number" required /></div>
        <div class="field"><label>${t('mppt')}</label><input id="f_mppt" type="number" value="1" /></div>
      </div>
      <div class="row">
        <div class="field"><label>${t('type')}</label>
          <select id="f_type"><option value="off-grid">${t('off_grid')}</option><option value="hybrid">${t('hybrid')}</option></select>
        </div>
        <div class="field"><label>${t('voltage')}</label>
          <select id="f_battery_voltage"><option value="12V">12V</option><option value="24V">24V</option><option value="48V">48V</option></select>
        </div>
      </div>
      <div class="field"><label>${t('warranty')} (${t('months')})</label><input id="f_warranty" type="number" value="24" /></div>
      <div class="row">
        <div class="field"><label>${t('price_usd')}</label><input id="f_price_usd" type="number" step="0.01" required /></div>
        <div class="field"><label>${t('price_khr')}</label><input id="f_price_khr" type="number" value="0" /></div>
      </div>`;
  }

  function panelForm() {
    return `
      <div class="field"><label>${t('brand')}</label><input id="f_brand" required /></div>
      <div class="field"><label>${t('power')} (W)</label><input id="f_rated_power" type="number" required /></div>
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
        <div class="field"><label>${t('price_usd')}</label><input id="f_price_usd" type="number" step="0.01" required /></div>
        <div class="field"><label>${t('price_khr')}</label><input id="f_price_khr" type="number" value="0" /></div>
      </div>`;
  }

  function batteryForm() {
    return `
      <div class="field"><label>${t('brand')}</label><input id="f_brand" required /></div>
      <div class="row">
        <div class="field"><label>${t('capacity')} (kWh)</label><input id="f_capacity" type="number" step="0.01" required /></div>
        <div class="field"><label>${t('voltage')} (V)</label><input id="f_voltage" type="number" value="48" /></div>
      </div>
      <div class="row">
        <div class="field"><label>${t('type')}</label>
          <select id="f_type">
            <option value="lead-acid">${t('battery_lead_acid')}</option>
            <option value="lfp">${t('battery_lfp')}</option>
            <option value="lithium-ternary">${t('battery_ternary')}</option>
          </select>
        </div>
        <div class="field"><label>${t('discharge_rate')} (C)</label><input id="f_discharge" type="number" step="0.1" value="0.5" /></div>
      </div>
      <div class="field"><label>${t('warranty')} (${t('months')})</label><input id="f_warranty" type="number" value="36" /></div>
      <div class="row">
        <div class="field"><label>${t('price_usd')}</label><input id="f_price_usd" type="number" step="0.01" required /></div>
        <div class="field"><label>${t('price_khr')}</label><input id="f_price_khr" type="number" value="0" /></div>
      </div>`;
  }

  async function loadItemForEdit(id) {
    try {
      const r = await fetch(`${TAB_ENDPOINT[currentTab]}/${id}`.replace(`/${id}`, ''));
      const data = await r.json();
      const p = data.find((x) => x.id === id);
      if (!p) return;
      document.getElementById('f_brand').value = p.brand || '';
      document.getElementById('f_price_usd').value = p.price_usd || 0;
      document.getElementById('f_price_khr').value = p.price_khr || 0;
      document.getElementById('f_warranty').value = p.warranty_months || 0;
      if (currentTab === 'inverters') {
        document.getElementById('f_rated_power').value = p.rated_power || 0;
        document.getElementById('f_mppt').value = p.mppt_channels || 1;
        document.getElementById('f_type').value = p.type;
        document.getElementById('f_battery_voltage').value = p.battery_voltage;
      } else if (currentTab === 'panels') {
        document.getElementById('f_rated_power').value = p.rated_power || 0;
        document.getElementById('f_length').value = p.length_mm || '';
        document.getElementById('f_width').value = p.width_mm || '';
        document.getElementById('f_height').value = p.height_mm || '';
        document.getElementById('f_vmin').value = p.voltage_min || '';
        document.getElementById('f_vmax').value = p.voltage_max || '';
        document.getElementById('f_glass').value = p.glass_type;
        const tech = Array.isArray(p.technology) ? p.technology : [];
        document.querySelectorAll('#techChips .chip').forEach((c) => {
          if (tech.includes(c.dataset.tech)) c.classList.add('selected');
        });
      } else {
        document.getElementById('f_capacity').value = p.capacity_kwh || 0;
        document.getElementById('f_voltage').value = p.nominal_voltage || 48;
        document.getElementById('f_type').value = p.type;
        document.getElementById('f_discharge').value = p.discharge_rate || 0.5;
      }
    } catch (e) {}
  }

  function collectForm() {
    const get = (id) => document.getElementById(id).value;
    const body = {
      brand: get('f_brand'),
      warranty_months: Number(get('f_warranty')) || 0,
      price_usd: Number(get('f_price_usd')) || 0,
      price_khr: Number(get('f_price_khr')) || 0,
    };
    if (currentTab === 'inverters') {
      body.rated_power = Number(get('f_rated_power'));
      body.mppt_channels = Number(get('f_mppt')) || 1;
      body.type = get('f_type');
      body.battery_voltage = get('f_battery_voltage');
    } else if (currentTab === 'panels') {
      body.rated_power = Number(get('f_rated_power'));
      body.length_mm = Number(get('f_length')) || null;
      body.width_mm = Number(get('f_width')) || null;
      body.height_mm = Number(get('f_height')) || null;
      body.voltage_min = Number(get('f_vmin')) || null;
      body.voltage_max = Number(get('f_vmax')) || null;
      body.glass_type = get('f_glass');
      body.technology = Array.from(document.querySelectorAll('#techChips .chip.selected')).map((c) => c.dataset.tech);
    } else {
      body.capacity_kwh = Number(get('f_capacity'));
      body.nominal_voltage = Number(get('f_voltage')) || 48;
      body.type = get('f_type');
      body.discharge_rate = Number(get('f_discharge')) || 0.5;
    }
    return body;
  }

  async function saveItem() {
    const body = collectForm();
    if (!body.brand || body.price_usd === undefined) {
      showToast(t('required'), true);
      return;
    }
    const url = TAB_ENDPOINT[currentTab] + (editingId ? `/${editingId}` : '');
    const method = editingId ? 'PUT' : 'POST';
    try {
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      closeModal();
      loadTab(currentTab);
      showToast(t('saved'));
    } catch (e) {
      showToast(t('error'), true);
    }
  }

  // Tech chips toggle (event delegation)
  document.getElementById('modalBody').addEventListener('click', (e) => {
    if (e.target.classList.contains('chip')) {
      e.target.classList.toggle('selected');
    }
  });

  /* ===================== Settings ===================== */
  async function loadSettings() {
    const panel = document.getElementById('settingsPanel');
    panel.innerHTML = '<div class="empty-state">...</div>';
    try {
      const r = await fetch('/api/config');
      const cfg = await r.json();
      panel.innerHTML = `
        <div class="card">
          <div class="field"><label>${t('admin_password')}</label><input id="s_password" type="text" placeholder="••••••" /></div>
          <div class="field"><label>${t('peak_sun_hours')}</label><input id="s_psh" type="number" step="0.1" value="${cfg.default_peak_sun_hours || 5}" /></div>
          <div class="field"><label>${t('default_currency')}</label>
            <select id="s_currency">
              <option value="USD" ${cfg.default_currency === 'USD' ? 'selected' : ''}>USD</option>
              <option value="KHR" ${cfg.default_currency === 'KHR' ? 'selected' : ''}>KHR</option>
            </select>
          </div>
          <div class="field"><label>${t('usd_to_khr')}</label><input id="s_rate" type="number" value="${cfg.usd_to_khr || 4100}" /></div>
          <button class="btn btn-primary" id="saveSettings">${t('save_settings')}</button>
        </div>`;
      document.getElementById('saveSettings').addEventListener('click', saveSettings);
    } catch (e) {
      panel.innerHTML = `<div class="card empty-state">${t('error')}</div>`;
    }
  }

  async function saveSettings() {
    const pwd = prompt(t('admin_password'));
    if (!pwd) return;
    const updates = {
      default_peak_sun_hours: document.getElementById('s_psh').value,
      default_currency: document.getElementById('s_currency').value,
      usd_to_khr: document.getElementById('s_rate').value,
    };
    const newPwd = document.getElementById('s_password').value;
    if (newPwd) updates.admin_password = newPwd;
    try {
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd, updates }),
      });
      if (r.ok) showToast(t('saved'));
      else showToast(t('error'), true);
    } catch (e) {
      showToast(t('error'), true);
    }
  }

  /* ===================== Utils ===================== */
  function showToast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = isError ? 'var(--danger)' : 'var(--success)';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  }

  function initLang() {
    const lang = getCurrentLang();
    document.querySelectorAll('#langSwitcher button').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === lang);
      b.addEventListener('click', () => {
        setLang(b.dataset.lang);
        initLang();
        if (!document.getElementById('adminPanel').style.display) loadTab(currentTab);
      });
    });
    applyLang();
  }

  function bootstrap() {
    initLang();
    if (adminToken) showPanel();
  }
  if (document.readyState === 'complete') {
    bootstrap();
  } else {
    window.addEventListener('load', bootstrap);
  }
})();
