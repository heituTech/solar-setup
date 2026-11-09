// Member portal: registration, login, profile and interactive quote
(function () {
  const TOKEN_KEY = 'member_token';
  const SELECT_KEYS = { inverters: 'inverter_id', batteries: 'battery_id', panels: 'panel_id' };

  let token = localStorage.getItem(TOKEN_KEY) || '';
  let me = null;
  let config = { usd_to_khr: 4100 };
  let lastQuote = null;
  let selection = { inverter_id: null, battery_id: null, panel_id: null };
  let panelQty = null;
  let catalogCat = 'inverters';
  let catalogLoaded = false;
  let codeTimer = null;
  let loginCodeTimer = null;
  let countries = [];

  // Typical device presets per usage scenario. Hours are equivalent running hours per day.
  const SCENARIO_PRESETS = {
    house: [
      { name_key: 'dev_air', power: 1200, qty: 1, day_hours: 6, night_hours: 4, critical: true },
      { name_key: 'dev_water_heater', power: 2000, qty: 1, day_hours: 0.5, night_hours: 0.5, critical: true },
      { name_key: 'dev_fridge', power: 200, qty: 1, day_hours: 5, night_hours: 5, critical: true },
      { name_key: 'dev_tv', power: 150, qty: 1, day_hours: 4, night_hours: 3, critical: false },
      { name_key: 'dev_lights', power: 100, qty: 1, day_hours: 0, night_hours: 6, critical: true },
    ],
    supermarket: [
      { name_key: 'dev_freezer', power: 400, qty: 2, day_hours: 8, night_hours: 12, critical: true },
      { name_key: 'dev_fridge', power: 300, qty: 2, day_hours: 8, night_hours: 10, critical: true },
      { name_key: 'dev_lights', power: 500, qty: 1, day_hours: 8, night_hours: 0, critical: false },
      { name_key: 'dev_air', power: 1500, qty: 2, day_hours: 8, night_hours: 0, critical: false },
    ],
    resort: [
      { name_key: 'dev_air', power: 1200, qty: 10, day_hours: 6, night_hours: 8, critical: true },
      { name_key: 'dev_water_heater', power: 2000, qty: 5, day_hours: 2, night_hours: 2, critical: true },
      { name_key: 'dev_water_pump', power: 750, qty: 1, day_hours: 3, night_hours: 1, critical: true },
      { name_key: 'dev_pool_pump', power: 1100, qty: 1, day_hours: 6, night_hours: 0, critical: false },
      { name_key: 'dev_lights', power: 600, qty: 1, day_hours: 2, night_hours: 8, critical: true },
    ],
    cafe: [
      { name_key: 'dev_coffee_machine', power: 1500, qty: 1, day_hours: 4, night_hours: 0, critical: false },
      { name_key: 'dev_ice_maker', power: 800, qty: 1, day_hours: 8, night_hours: 2, critical: true },
      { name_key: 'dev_fridge', power: 300, qty: 2, day_hours: 8, night_hours: 8, critical: true },
      { name_key: 'dev_air', power: 1500, qty: 1, day_hours: 8, night_hours: 0, critical: false },
      { name_key: 'dev_lights', power: 300, qty: 1, day_hours: 6, night_hours: 4, critical: false },
    ],
  };

  /* ===================== Helpers ===================== */

  function errMsg(e) {
    const key = e && e.error;
    if (!key) return t('error');
    let value = t(key);
    if (value === key) return key;
    if (e && e.params) {
      Object.keys(e.params).forEach((k) => {
        value = value.split('{' + k + '}').join(e.params[k]);
      });
    }
    return value;
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
      clearSession();
      throw { status: 401, error: 'unauthorized' };
    }
    if (!r.ok) throw { status: r.status, error: (data && data.error) || 'error', params: data && data.params, options: data && data.options };
    return data;
  }

  function showToast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = isError ? 'var(--danger)' : 'var(--success)';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }

  function fmtUsd(value) {
    return '$' + Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtKhr(value) {
    return Number(value || 0).toLocaleString() + ' KHR';
  }

  function fmtNum(value, unit) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return Number(value).toLocaleString() + (unit ? ' ' + unit : '');
  }

  // Battery capacity: round up to 1 decimal (24.84 -> 24.9).
  function fmtBatteryKwh(value) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    let n = Math.ceil(Number(value) * 10 - 1e-6) / 10;
    if (!(n > 0)) n = 0;
    return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kWh';
  }

  // Solar array power: round up to the nearest 100W (11,283.11 -> 11,300).
  function fmtSolarWatts(value) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    let n = Math.ceil(Number(value) / 100 - 1e-6) * 100;
    if (!(n > 0)) n = 0;
    return n.toLocaleString() + ' W';
  }

  function fmtRange(min, max, formatter) {
    if (min === null || min === undefined) return '-';
    if (min === max || max === null || max === undefined) return formatter(min);
    return formatter(min) + ' – ' + formatter(max);
  }

  // Battery is only quoted after the customer chooses off-grid or hybrid.
  function batteryNeededText(calc) {
    if (!calc || calc.battery_required === false) return t('battery_not_needed');
    if (Number(calc.night_energy_kwh) > 0) return fmtBatteryKwh(calc.battery_kwh_needed);
    return t('battery_min_one');
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function round1(value) {
    return Math.round(Number(value) * 10) / 10;
  }

  // Every string must have the same panel count: qty has to split into equal
  // strings, each within the MPPT voltage limit, and no more strings than the
  // inverter's MPPT inputs allow.
  function qtyFormsStrings(qty, s) {
    if (!s) return true;
    const maxStrings = Math.min(Number(s.max_strings) || 0, qty);
    for (let strings = 1; strings <= maxStrings; strings += 1) {
      if (qty % strings === 0 && qty / strings <= Number(s.max_series)) return true;
    }
    return false;
  }

  function categoryLabel(category) {
    if (category === 'inverter') return t('inverter');
    if (category === 'panel') return t('solar_panel');
    return t('battery');
  }

  function battTypeLabel(type) {
    const map = {
      'lead-acid': t('battery_lead_acid'),
      lfp: t('battery_lfp'),
      'lithium-ternary': t('battery_ternary'),
    };
    return map[type] || type;
  }

  function glassLabel(g) {
    return g === 'double' ? t('double_glass') : t('single_glass');
  }

  /* ===================== Session ===================== */

  function showAuth() {
    document.getElementById('authBox').style.display = '';
    document.getElementById('memberPanel').style.display = 'none';
  }

  function showPanel() {
    document.getElementById('authBox').style.display = 'none';
    document.getElementById('memberPanel').style.display = '';
    document.getElementById('memberName').textContent = me.username || me.email || me.phone || '';
    fillProfile();
    loadCases();
  }

  function clearSession() {
    token = '';
    me = null;
    localStorage.removeItem(TOKEN_KEY);
    showAuth();
  }

  document.getElementById('memberLogoutBtn').addEventListener('click', () => {
    clearSession();
    showToast(t('logged_out'));
  });

  async function loadMe() {
    if (!token) return null;
    try {
      const data = await api('/pv/api/auth/me');
      if (!data.user || data.user.role !== 'member') {
        clearSession();
        return null;
      }
      me = data.user;
      return me;
    } catch (e) {
      return null;
    }
  }

  /* ===================== Auth forms ===================== */

  let authMode = 'login';
  let pendingPhoneLogin = null;

  function countryOptionLabel(c) {
    return `${c.name} +${c.dial}`;
  }

  function countryFlagUrl(code) {
    return `https://flagcdn.com/24x18/${String(code || '').toLowerCase()}.png`;
  }

  async function loadCountries() {
    try {
      const data = await api('/pv/api/config/countries', { auth: false });
      countries = Array.isArray(data.countries) ? data.countries : [];
    } catch {
      countries = [];
    }
    if (!countries.length) countries = [{ code: 'KH', dial: '855', name: 'Cambodia' }];
  }

  function fillPhoneCountries() {
    const select = document.getElementById('r_phone_country');
    if (!select) return;
    select.innerHTML = countries
      .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(countryOptionLabel(c))}</option>`)
      .join('');
    select.value = countries.some((c) => c.code === 'KH') ? 'KH' : countries[0].code;
  }

  function setAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll('#authTabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    document.getElementById('loginForm').style.display = mode === 'login' ? '' : 'none';
    document.getElementById('registerForm').style.display = mode === 'register' ? '' : 'none';
  }

  function updateLoginMethod() {
    const method = document.getElementById('loginMethod').value;
    document.getElementById('loginPasswordFields').style.display = method === 'password' ? '' : 'none';
    document.getElementById('loginCodeFields').style.display = method === 'code' ? '' : 'none';
  }

  document.getElementById('loginMethod').addEventListener('change', updateLoginMethod);

  document.querySelectorAll('#authTabs button').forEach((b) => {
    if (b.disabled) return;
    b.addEventListener('click', () => setAuthMode(b.dataset.mode));
  });

  function enterSession(data) {
    if (data.user.role !== 'member') {
      localStorage.setItem('staff_token', data.token);
      showToast(t('staff_redirect'));
      location.href = '/pv/admin';
      return false;
    }
    token = data.token;
    me = data.user;
    localStorage.setItem(TOKEN_KEY, token);
    showPanel();
    return true;
  }

  document.getElementById('memberLoginBtn').addEventListener('click', async () => {
    const identifier = document.getElementById('m_identifier').value.trim();
    const password = document.getElementById('m_password').value;
    if (!identifier || !password) {
      showToast(t('identifier_and_password_required'), true);
      return;
    }
    try {
      const data = await api('/pv/api/auth/login', {
        method: 'POST',
        body: { identifier, password },
        auth: false,
      });
      enterSession(data);
    } catch (e) {
      if (e && e.error === 'phone_ambiguous' && Array.isArray(e.options) && e.options.length) {
        openPhonePick(e.options, identifier, password);
        return;
      }
      showToast(errMsg(e), true);
    }
  });

  function openPhonePick(options, identifier, password) {
    pendingPhoneLogin = { identifier, password };
    const list = document.getElementById('phonePickOptions');
    list.innerHTML = options
      .map((o, i) => `<label class="phone-pick-item${i === 0 ? ' selected' : ''}">
        <input type="radio" name="phonePick" value="${escapeHtml(o.code)}"${i === 0 ? ' checked' : ''} />
        <img class="flag-icon" src="${countryFlagUrl(o.code)}" alt="${escapeHtml(o.code)}" onerror="this.style.visibility='hidden'" />
        <span class="phone-pick-code">${escapeHtml(o.code)} · +${escapeHtml(o.dial)}</span>
        <span>${escapeHtml(o.name)}</span>
      </label>`)
      .join('');
    document.getElementById('phonePickModal').classList.add('active');
  }

  document.getElementById('phonePickOptions').addEventListener('change', (ev) => {
    if (!ev.target.matches('input[name="phonePick"]')) return;
    document.querySelectorAll('#phonePickOptions .phone-pick-item').forEach((item) => {
      item.classList.toggle('selected', item.querySelector('input').checked);
    });
  });

  document.getElementById('phonePickCancel').addEventListener('click', () => {
    pendingPhoneLogin = null;
    document.getElementById('phonePickModal').classList.remove('active');
  });

  document.getElementById('phonePickConfirm').addEventListener('click', async () => {
    if (!pendingPhoneLogin) return;
    const checked = document.querySelector('#phonePickOptions input[name="phonePick"]:checked');
    if (!checked) return;
    const ctx = pendingPhoneLogin;
    pendingPhoneLogin = null;
    document.getElementById('phonePickModal').classList.remove('active');
    try {
      const data = await api('/pv/api/auth/login', {
        method: 'POST',
        body: { identifier: ctx.identifier, password: ctx.password, phone_country: checked.value },
        auth: false,
      });
      enterSession(data);
    } catch (e) {
      showToast(errMsg(e), true);
    }
  });

  document.getElementById('sendCodeBtn').addEventListener('click', async () => {
    const email = document.getElementById('r_email').value.trim();
    if (!email) {
      showToast(t('email'), true);
      return;
    }
    const btn = document.getElementById('sendCodeBtn');
    try {
      const data = await api('/pv/api/auth/request-code', {
        method: 'POST',
        body: { email },
        auth: false,
      });
      showToast(t('code_sent'));
      if (data.dev_mode) document.getElementById('devHint').style.display = '';
      startCooldown(btn, 60);
    } catch (e) {
      showToast(errMsg(e), true);
    }
  });

  document.getElementById('sendLoginCodeBtn').addEventListener('click', async () => {
    const email = document.getElementById('cl_email').value.trim();
    if (!email) {
      showToast(t('email'), true);
      return;
    }
    const btn = document.getElementById('sendLoginCodeBtn');
    try {
      const data = await api('/pv/api/auth/request-code', {
        method: 'POST',
        body: { email, purpose: 'login' },
        auth: false,
      });
      showToast(t('code_sent'));
      if (data.dev_mode) document.getElementById('devHintLogin').style.display = '';
      startCooldown(btn, 60, 'login');
    } catch (e) {
      showToast(errMsg(e), true);
    }
  });

  document.getElementById('codeLoginBtn').addEventListener('click', async () => {
    const email = document.getElementById('cl_email').value.trim();
    const code = document.getElementById('cl_code').value.trim();
    if (!email || !code) {
      showToast(t('invalid_code'), true);
      return;
    }
    try {
      const data = await api('/pv/api/auth/login-code', {
        method: 'POST',
        body: { email, code },
        auth: false,
      });
      enterSession(data);
    } catch (e) {
      showToast(errMsg(e), true);
    }
  });

  function startCooldown(btn, seconds, slot) {
    const running = slot === 'login' ? loginCodeTimer : codeTimer;
    if (running) clearInterval(running);
    let left = seconds;
    btn.disabled = true;
    btn.textContent = left + 's';
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        if (slot === 'login') loginCodeTimer = null;
        else codeTimer = null;
        btn.disabled = false;
        btn.textContent = t('send_code');
      } else {
        btn.textContent = left + 's';
      }
    }, 1000);
    if (slot === 'login') loginCodeTimer = timer;
    else codeTimer = timer;
  }

  document.getElementById('registerBtn').addEventListener('click', async () => {
    const body = {
      role: 'member',
      full_name: document.getElementById('r_name').value.trim(),
      username: document.getElementById('r_username').value.trim(),
      phone_country: document.getElementById('r_phone_country').value,
      phone: document.getElementById('r_phone').value.trim(),
      email: document.getElementById('r_email').value.trim(),
      code: document.getElementById('r_code').value.trim(),
      password: document.getElementById('r_password').value,
    };
    try {
      const data = await api('/pv/api/auth/register', { method: 'POST', body, auth: false });
      if (enterSession(data)) showToast(t('saved'));
    } catch (e) {
      showToast(errMsg(e), true);
    }
  });

  /* ===================== Profile ===================== */

  document.getElementById('toggleProfileBtn').addEventListener('click', () => {
    const card = document.getElementById('profileCard');
    card.style.display = card.style.display === 'none' ? '' : 'none';
    if (card.style.display !== 'none') fillProfile();
  });

  function fillProfile() {
    if (!me) return;
    document.getElementById('p_name').value = me.full_name || '';
    document.getElementById('p_phone').value = me.phone || '';
    document.getElementById('p_email').value = me.email || '';
  }

  document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const body = {
      full_name: document.getElementById('p_name').value.trim(),
      phone: document.getElementById('p_phone').value.trim(),
    };
    try {
      const data = await api('/pv/api/auth/me', { method: 'PATCH', body });
      me = data.user;
      showToast(t('profile_saved'));
    } catch (e) {
      showToast(errMsg(e), true);
    }
  });

  /* ===================== Cases ===================== */

  let cases = [];
  let editingCaseId = null;
  let activeCaseId = null;

  function caseLabel(c) {
    return (c.name ? c.name + ' · ' : '') + c.address;
  }

  function caseMeta(c) {
    const parts = [
      c.has_grid ? t('has_grid_yes') : t('has_grid_no'),
      c.install_type === 'ground' ? t('install_ground') : t('install_rooftop'),
      c.system_mode === 'hybrid' ? t('hybrid') : t('off_grid'),
    ];
    if (c.usage_scenario) parts.unshift(t('scenario_' + c.usage_scenario));
    if (c.electricity_price !== null && c.electricity_price !== undefined) {
      parts.push(`${t('electricity_price')}: ${c.electricity_price} ${c.electricity_price_currency || 'USD'}/${t('kwh_unit')}`);
    }
    return parts.join(' · ');
  }

  function renderCaseList() {
    const list = document.getElementById('caseList');
    if (!cases.length) {
      list.innerHTML = `<div class="empty-state">${t('no_cases')}</div>`;
      return;
    }
    list.innerHTML = cases.map((c) => `<div class="product-item">
      <h4>${caseLabel(c)}</h4>
      <div class="meta">${caseMeta(c)}</div>
      <div class="row-actions">
        <button class="btn btn-primary btn-sm config-case" data-id="${c.id}">${t('configure_quote')}</button>
        <button class="btn btn-secondary btn-sm edit-case" data-id="${c.id}">${t('edit_case')}</button>
        <button class="btn btn-danger del-case" data-id="${c.id}">${t('delete')}</button>
      </div>
    </div>`).join('');
  }

  async function loadCases() {
    try {
      cases = await api('/pv/api/cases');
      renderCaseList();
    } catch (e) {
      cases = [];
      renderCaseList();
    }
  }

  document.getElementById('addCaseBtn').addEventListener('click', () => openCaseModal(null));
  document.getElementById('caseCancel').addEventListener('click', closeCaseModal);

  function openCaseModal(id) {
    editingCaseId = id;
    const c = id ? cases.find((x) => x.id === id) : null;
    document.getElementById('caseModalTitle').textContent = id ? t('edit_case') : t('add_case');
    document.getElementById('c_scenario').value = c && c.usage_scenario ? c.usage_scenario : '';
    updateScenarioHint();
    document.getElementById('c_name').value = c && c.name ? c.name : '';
    document.getElementById('c_address').value = c ? c.address : '';
    document.getElementById('c_has_grid').value = c ? (c.has_grid ? '1' : '0') : '1';
    document.getElementById('c_install_type').value = c ? c.install_type : 'rooftop';
    document.getElementById('c_system_mode').value = c ? c.system_mode : 'hybrid';
    syncCaseMode();
    document.getElementById('c_price').value = c && c.electricity_price !== null && c.electricity_price !== undefined ? c.electricity_price : '';
    document.getElementById('c_currency').value = c ? (c.electricity_price_currency || 'USD') : 'USD';
    document.getElementById('caseModal').classList.add('active');
  }

  function closeCaseModal() {
    document.getElementById('caseModal').classList.remove('active');
    editingCaseId = null;
  }

  function updateScenarioHint() {
    const scenario = document.getElementById('c_scenario').value;
    const hint = document.getElementById('c_scenario_hint');
    if (!scenario) {
      hint.style.display = 'none';
      hint.textContent = '';
      return;
    }
    hint.style.display = '';
    hint.textContent = t('scenario_' + scenario + '_guide');
  }

  document.getElementById('c_scenario').addEventListener('change', updateScenarioHint);

  function syncCaseMode() {
    const hasGridEl = document.getElementById('c_has_grid');
    const modeEl = document.getElementById('c_system_mode');
    const noteEl = document.getElementById('c_system_mode_note');
    if (!hasGridEl || !modeEl || !noteEl) return;
    const hasGrid = hasGridEl.value === '1';
    if (!hasGrid) modeEl.value = 'off-grid';
    modeEl.disabled = !hasGrid;
    noteEl.dataset.i18n = hasGrid ? 'system_mode_note' : 'system_mode_no_grid_note';
    noteEl.textContent = t(noteEl.dataset.i18n);
  }

  document.getElementById('c_has_grid').addEventListener('change', syncCaseMode);

  function updateAutonomyWarning() {
    const note = document.getElementById('autonomyWarn');
    if (!note) return;
    const days = parseFloat(document.getElementById('autonomyDays').value);
    if (Number.isFinite(days) && days > 1) {
      note.textContent = t('autonomy_warn_multi').replace(/{days}/g, String(days));
      note.classList.add('autonomy-warn');
    } else {
      note.textContent = t('autonomy_days_note');
      note.classList.remove('autonomy-warn');
    }
  }

  document.getElementById('autonomyDays').addEventListener('input', updateAutonomyWarning);

  /* ===================== Configurator (per-case) ===================== */

  let snapshotNoteKey = null;

  function setSnapshotNoteKey(key) {
    snapshotNoteKey = key || null;
    const el = document.getElementById('quoteSnapshotNote');
    el.textContent = snapshotNoteKey ? t(snapshotNoteKey) : '';
    el.style.display = snapshotNoteKey ? '' : 'none';
  }

  async function openConfigurator(id) {
    const c = cases.find((x) => x.id === id);
    if (!c) return;
    activeCaseId = id;
    selection = { inverter_id: null, battery_id: null, panel_id: null };
    panelQty = null;
    lastQuote = null;
    document.getElementById('quoteResults').innerHTML = '';
    setSnapshotNoteKey(null);
    document.getElementById('activeCaseLabel').textContent = caseLabel(c);
    const isHybrid = c.system_mode === 'hybrid';
    document.getElementById('backupLoadRow').style.display = isHybrid ? '' : 'none';
    document.getElementById('hybridLoadNote').style.display = isHybrid ? '' : 'none';
    setupLoadBuilder(c);
    const card = document.getElementById('configuratorCard');
    card.style.display = '';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Load the last saved recommendation for this case and restore it.
    let full = c;
    try {
      full = await api('/pv/api/cases/' + id);
    } catch (e) {
      return;
    }
    if (activeCaseId !== id) return;
    const idx = cases.findIndex((x) => x.id === id);
    if (idx >= 0) cases[idx] = full;
    setupLoadBuilder(full);
    restoreQuoteSnapshot(full.quote);
  }

  // Re-apply the saved quote inputs after the load checklist recalculates totals.
  function restoreQuoteSnapshot(snapshot) {
    if (!snapshot || !snapshot.result) return;
    const input = snapshot.input || {};
    const setInput = (id, value) => {
      if (value === null || value === undefined) return;
      if (!Number.isFinite(Number(value))) return;
      document.getElementById(id).value = String(Number(value));
    };
    setInput('dayPower', input.day_peak_power);
    setInput('dayHours', input.day_hours);
    setInput('nightPower', input.night_peak_power);
    setInput('nightHours', input.night_hours);
    setInput('backupPower', input.backup_peak_power);
    setInput('autonomyDays', input.autonomy_days);
    if (input.strategy !== undefined && input.strategy !== null) {
      document.getElementById('strategy').value = String(input.strategy);
    }
    document.getElementById('batteryType').value = input.battery_type || '';
    selection = {
      inverter_id: input.inverter_id || null,
      battery_id: input.battery_id || null,
      panel_id: input.panel_id || null,
    };
    panelQty = input.panel_qty !== null && input.panel_qty !== undefined && Number.isFinite(Number(input.panel_qty))
      ? Number(input.panel_qty) : null;
    lastQuote = snapshot.result;
    renderQuote(lastQuote);
    updateAutonomyWarning();
    setSnapshotNoteKey(snapshot.catalog_stale ? 'quote_catalog_changed' : 'quote_restored');
  }

  function closeConfigurator() {
    document.getElementById('configuratorCard').style.display = 'none';
    activeCaseId = null;
  }

  document.getElementById('closeConfigurator').addEventListener('click', closeConfigurator);

  document.getElementById('caseSave').addEventListener('click', async () => {
    const priceRaw = document.getElementById('c_price').value;
    const body = {
      usage_scenario: document.getElementById('c_scenario').value || null,
      name: document.getElementById('c_name').value.trim() || null,
      address: document.getElementById('c_address').value.trim(),
      has_grid: document.getElementById('c_has_grid').value === '1',
      install_type: document.getElementById('c_install_type').value,
      system_mode: document.getElementById('c_system_mode').value,
      electricity_price: priceRaw === '' ? null : Number(priceRaw),
      electricity_price_currency: document.getElementById('c_currency').value,
    };
    try {
      if (editingCaseId) {
        await api('/pv/api/cases/' + editingCaseId, { method: 'PUT', body });
      } else {
        await api('/pv/api/cases', { method: 'POST', body });
      }
      closeCaseModal();
      showToast(t('saved'));
      loadCases();
    } catch (e) {
      showToast(errMsg(e), true);
    }
  });

  document.getElementById('caseList').addEventListener('click', async (e) => {
    const configBtn = e.target.closest('.config-case');
    if (configBtn) {
      openConfigurator(Number(configBtn.dataset.id));
      return;
    }
    const editBtn = e.target.closest('.edit-case');
    if (editBtn) {
      openCaseModal(Number(editBtn.dataset.id));
      return;
    }
    const delBtn = e.target.closest('.del-case');
    if (delBtn) {
      if (!confirm(t('confirm_delete_case'))) return;
      try {
        const id = Number(delBtn.dataset.id);
        await api('/pv/api/cases/' + id, { method: 'DELETE' });
        if (activeCaseId === id) {
          closeConfigurator();
          document.getElementById('quoteResults').innerHTML = '';
        }
        showToast(t('saved'));
        loadCases();
      } catch (err) {
        showToast(errMsg(err), true);
      }
    }
  });

  /* ===================== Scenario load checklist ===================== */

  let loadItems = [];
  let loadSaveTimer = null;

  function isHybridActiveCase() {
    const c = cases.find((x) => x.id === activeCaseId);
    return Boolean(c && c.system_mode === 'hybrid');
  }

  function normalizeLoadItems(raw) {
    return raw.map((it) => ({
      name_key: it && it.name_key ? String(it.name_key) : null,
      name: it && typeof it.name === 'string' ? it.name : '',
      power: Number(it && it.power) || 0,
      qty: Number(it && it.qty) || 0,
      day_hours: Math.min(8, Number(it && it.day_hours) || 0),
      night_hours: Math.min(16, Number(it && it.night_hours) || 0),
      critical: Boolean(it && it.critical),
    }));
  }

  function presetForScenario(scenario) {
    return (SCENARIO_PRESETS[scenario] || []).map((it) => Object.assign({}, it));
  }

  function setupLoadBuilder(c) {
    const card = document.getElementById('loadBuilderCard');
    if (!c || !c.usage_scenario) {
      card.style.display = 'none';
      loadItems = [];
      return;
    }
    card.style.display = '';
    loadItems = Array.isArray(c.load_items) ? normalizeLoadItems(c.load_items) : presetForScenario(c.usage_scenario);
    document.getElementById('scenarioGuide').textContent = t('scenario_' + c.usage_scenario + '_guide');
    document.getElementById('loadSaveStatus').textContent = '';
    renderLoadRows();
    applyLoadTotals();
  }

  function renderLoadRows() {
    const container = document.getElementById('loadRows');
    const hybrid = isHybridActiveCase();
    container.innerHTML = loadItems.map((it, i) => {
      const nameCell = it.name_key
        ? `<div class="load-name">${escapeHtml(t(it.name_key))}</div>`
        : `<input type="text" data-field="name" data-index="${i}" value="${escapeHtml(it.name)}" placeholder="${escapeHtml(t('device_name'))}" />`;
      return `<div class="load-row" data-index="${i}">
        <div class="name-cell"><label>${escapeHtml(t('device'))}</label>${nameCell}</div>
        <div><label>${escapeHtml(t('power_w'))}</label><input type="number" min="0" step="1" data-field="power" data-index="${i}" value="${it.power}" /></div>
        <div><label>${escapeHtml(t('qty'))}</label><input type="number" min="0" step="1" data-field="qty" data-index="${i}" value="${it.qty}" /></div>
        <div><label>${escapeHtml(t('day_hours_short'))}</label><input type="number" min="0" max="8" step="0.1" data-field="day_hours" data-index="${i}" value="${it.day_hours}" /></div>
        <div><label>${escapeHtml(t('night_hours_short'))}</label><input type="number" min="0" max="16" step="0.1" data-field="night_hours" data-index="${i}" value="${it.night_hours}" /></div>
        ${hybrid ? `<div><label>${escapeHtml(t('critical_load'))}</label><div class="critical-cell"><input type="checkbox" data-field="critical" data-index="${i}" ${it.critical ? 'checked' : ''} /></div></div>` : ''}
        <button type="button" class="del-load" data-index="${i}">×</button>
      </div>`;
    }).join('');
  }

  function computeLoadTotals() {
    const hybrid = isHybridActiveCase();
    let dayPeak = 0;
    let dayWh = 0;
    let nightPeak = 0;
    let nightWh = 0;
    let backupPeak = 0;
    loadItems.forEach((it) => {
      const w = (Number(it.power) || 0) * (Number(it.qty) || 0);
      const dayHours = Number(it.day_hours) || 0;
      const nightHours = Number(it.night_hours) || 0;
      if (w > 0 && dayHours > 0) {
        dayPeak += w;
        dayWh += w * dayHours;
      }
      if (w > 0 && nightHours > 0) {
        nightPeak += w;
        nightWh += w * nightHours;
      }
      if (hybrid && it.critical && w > 0) backupPeak += w;
    });
    return {
      dayPeak,
      nightPeak,
      backupPeak,
      dayHours: dayPeak > 0 ? dayWh / dayPeak : 0,
      nightHours: nightPeak > 0 ? nightWh / nightPeak : 0,
    };
  }

  function loadTotalsWithFallback() {
    const agg = computeLoadTotals();
    let dayPeak = agg.dayPeak;
    let dayHours = agg.dayHours;
    // The quote API requires a positive day peak; reuse the night peak when only night loads exist.
    if (dayPeak <= 0 && agg.nightPeak > 0) {
      dayPeak = agg.nightPeak;
      dayHours = 0;
    }
    return { agg, dayPeak, dayHours };
  }

  function applyLoadTotals() {
    const { agg, dayPeak, dayHours } = loadTotalsWithFallback();
    document.getElementById('dayPower').value = dayPeak > 0 ? Math.round(dayPeak) : '';
    document.getElementById('dayHours').value = dayPeak > 0 ? round1(dayHours) : '';
    document.getElementById('nightPower').value = agg.nightPeak > 0 ? Math.round(agg.nightPeak) : '';
    document.getElementById('nightHours').value = agg.nightPeak > 0 ? round1(agg.nightHours) : '';
    if (isHybridActiveCase()) {
      document.getElementById('backupPower').value = agg.backupPeak > 0 ? Math.round(agg.backupPeak) : '';
    }
    refreshLoadSummary();
  }

  function refreshLoadSummary() {
    const { agg, dayPeak, dayHours } = loadTotalsWithFallback();
    const parts = [
      `${t('load_summary_day')}: ${Math.round(dayPeak)}W × ${round1(dayHours)}h`,
      `${t('load_summary_night')}: ${Math.round(agg.nightPeak)}W × ${round1(agg.nightHours)}h`,
    ];
    if (isHybridActiveCase()) parts.push(`${t('load_summary_backup')}: ${Math.round(agg.backupPeak)}W`);
    document.getElementById('loadSummary').textContent = parts.join(' · ');
  }

  function scheduleLoadSave() {
    if (!activeCaseId) return;
    document.getElementById('loadSaveStatus').textContent = t('saving');
    if (loadSaveTimer) clearTimeout(loadSaveTimer);
    loadSaveTimer = setTimeout(saveLoadItems, 800);
  }

  async function saveLoadItems() {
    if (!activeCaseId) return;
    try {
      const data = await api('/pv/api/cases/' + activeCaseId, { method: 'PUT', body: { load_items: loadItems } });
      const idx = cases.findIndex((x) => x.id === activeCaseId);
      if (idx >= 0) cases[idx] = data;
      document.getElementById('loadSaveStatus').textContent = t('auto_saved');
    } catch (e) {
      document.getElementById('loadSaveStatus').textContent = '';
      showToast(errMsg(e), true);
    }
  }

  function handleLoadRowChange(e) {
    const el = e.target;
    if (!el || !el.dataset || !el.dataset.field) return;
    const idx = Number(el.dataset.index);
    const item = loadItems[idx];
    if (!item) return;
    const field = el.dataset.field;
    if (field === 'name') {
      item.name = el.value;
    } else if (field === 'critical') {
      item.critical = el.checked;
    } else {
      let v = el.value === '' ? 0 : Number(el.value);
      const max = field === 'day_hours' ? 8 : field === 'night_hours' ? 16 : null;
      if (max !== null && v > max) {
        v = max;
        el.value = max;
      }
      item[field] = v;
    }
    applyLoadTotals();
    scheduleLoadSave();
  }

  document.getElementById('loadRows').addEventListener('input', handleLoadRowChange);
  document.getElementById('loadRows').addEventListener('change', handleLoadRowChange);

  document.getElementById('loadRows').addEventListener('click', (e) => {
    const btn = e.target.closest('.del-load');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    if (!Number.isInteger(idx) || !loadItems[idx]) return;
    loadItems.splice(idx, 1);
    renderLoadRows();
    applyLoadTotals();
    scheduleLoadSave();
  });

  document.getElementById('addLoadRow').addEventListener('click', () => {
    loadItems.push({ name_key: null, name: '', power: 0, qty: 1, day_hours: 0, night_hours: 0, critical: false });
    renderLoadRows();
    applyLoadTotals();
    scheduleLoadSave();
  });

  /* ===================== Tips ===================== */

  function openTip(kind) {
    let prefix = 'tip_' + kind;
    if (kind === 'load') {
      const active = cases.find((c) => c.id === activeCaseId);
      if (active && active.usage_scenario && SCENARIO_PRESETS[active.usage_scenario]) {
        prefix += '_' + active.usage_scenario;
      }
    }
    document.getElementById('tipTitle').textContent = t(prefix + '_title');
    document.getElementById('tipBody').innerHTML = t(prefix + '_body');
    document.getElementById('tipModal').classList.add('active');
  }

  document.querySelectorAll('.info-btn[data-tip]').forEach((b) => {
    b.addEventListener('click', () => openTip(b.dataset.tip));
  });
  document.getElementById('tipClose').addEventListener('click', () => {
    document.getElementById('tipModal').classList.remove('active');
  });

  /* ===================== Quote ===================== */

  function collectQuoteBody() {
    const dayPower = parseFloat(document.getElementById('dayPower').value);
    const dayHours = parseFloat(document.getElementById('dayHours').value);
    const nightPower = parseFloat(document.getElementById('nightPower').value);
    const nightHours = parseFloat(document.getElementById('nightHours').value);
    if (!Number.isFinite(dayPower) || dayPower <= 0) {
      showToast(t('invalid_day_peak_power'), true);
      return null;
    }
    if (!Number.isFinite(dayHours) || dayHours < 0 || dayHours > 8) {
      showToast(t('invalid_day_hours'), true);
      return null;
    }
    if (Number.isFinite(nightHours) && nightHours > 0 && (!Number.isFinite(nightPower) || nightPower <= 0)) {
      showToast(t('invalid_night_peak_power'), true);
      return null;
    }
    if (Number.isFinite(nightHours) && nightHours > 16) {
      showToast(t('invalid_night_hours'), true);
      return null;
    }
    if ((!Number.isFinite(dayHours) || dayHours <= 0) && (!Number.isFinite(nightHours) || nightHours <= 0)) {
      showToast(t('invalid_daily_hours'), true);
      return null;
    }

    const body = {
      day_peak_power: dayPower,
      day_hours: Number.isFinite(dayHours) ? dayHours : 0,
      night_peak_power: Number.isFinite(nightPower) ? nightPower : 0,
      night_hours: Number.isFinite(nightHours) ? nightHours : 0,
      autonomy_days: parseFloat(document.getElementById('autonomyDays').value) || 1,
      strategy: Number(document.getElementById('strategy').value) || 2,
    };
    if (!activeCaseId) {
      showToast(t('case_required'), true);
      return null;
    }
    body.case_id = activeCaseId;
    const activeCase = cases.find((x) => x.id === activeCaseId);
    if (activeCase && activeCase.system_mode === 'hybrid') {
      const backupRaw = document.getElementById('backupPower').value.trim();
      if (backupRaw !== '') {
        const backupPower = parseFloat(backupRaw);
        if (!Number.isFinite(backupPower) || backupPower <= 0) {
          showToast(t('invalid_backup_peak_power'), true);
          return null;
        }
        body.backup_peak_power = backupPower;
      }
    }
    const batteryType = document.getElementById('batteryType').value;
    if (batteryType) body.battery_type = batteryType;

    if (selection.inverter_id) body.inverter_id = selection.inverter_id;
    if (selection.battery_id) body.battery_id = selection.battery_id;
    if (selection.panel_id) body.panel_id = selection.panel_id;
    if (selection.panel_id && panelQty !== null) body.panel_qty = panelQty;
    return body;
  }

  let quoting = false;

  // The whole catalog, config and pricing algorithm are available in the browser,
  // so the recommendation is computed locally and only the fetches are async.
  async function loadPricingData() {
    const [cfg, inverters, batteries, panels] = await Promise.all([
      api('/pv/api/config', { auth: false }),
      api('/pv/api/products/inverters', { auth: false }),
      api('/pv/api/products/batteries', { auth: false }),
      api('/pv/api/products/panels', { auth: false }),
    ]);
    return { config: cfg, products: { inverters, batteries, panels } };
  }

  function caseForActiveId() {
    return cases.find((x) => x.id === activeCaseId) || null;
  }

  async function buildLocalQuote(body) {
    if (!window.SolarPricing) throw { status: 500, error: 'pricing_unavailable' };
    const data = await loadPricingData();
    return window.SolarPricing.buildQuote(body, {
      user: me ? { id: me.id, role: me.role } : null,
      caseInfo: caseForActiveId(),
      config: data.config,
      products: data.products,
    });
  }

  function quoteSnapshotInput(body, data) {
    const input = data.input || {};
    return {
      day_peak_power: input.day_peak_power,
      day_hours: input.day_hours,
      night_peak_power: input.night_peak_power,
      night_hours: input.night_hours,
      backup_peak_power: input.backup_peak_power,
      autonomy_days: input.autonomy_days,
      strategy: input.strategy,
      battery_type: input.battery_type,
      inverter_id: body.inverter_id || null,
      battery_id: body.battery_id || null,
      panel_id: body.panel_id || null,
      panel_qty: body.panel_id && body.panel_qty !== undefined && body.panel_qty !== ''
        ? Number(body.panel_qty) : null,
    };
  }

  async function runQuote() {
    if (quoting) return false;
    const body = collectQuoteBody();
    if (!body) return false;
    const btn = document.getElementById('quoteBtn');
    quoting = true;
    btn.disabled = true;
    btn.textContent = t('calculating');
    try {
      const data = await buildLocalQuote(body);
      lastQuote = data;
      renderQuote(data);
      setSnapshotNoteKey(null);
      if (activeCaseId) {
        // Persist this recommendation so reopening the case restores it.
        try {
          await api('/pv/api/cases/' + activeCaseId + '/quote', {
            method: 'PUT',
            body: { input: quoteSnapshotInput(body, data), result: data },
          });
        } catch (e) {
          // A failed snapshot must never invalidate the quote itself.
        }
      }
      return true;
    } catch (e) {
      if (e && e.status === 401) return false;
      document.getElementById('quoteResults').innerHTML = `<div class="card quote-error">${errMsg(e)}</div>`;
      showToast(errMsg(e), true);
      return false;
    } finally {
      quoting = false;
      btn.disabled = false;
      btn.textContent = t('calculate');
    }
  }

  document.getElementById('quoteBtn').addEventListener('click', () => {
    if (quoting) return;
    selection = { inverter_id: null, battery_id: null, panel_id: null };
    panelQty = null;
    runQuote();
  });

  async function changeSelection(category, id) {
    const prev = Object.assign({}, selection);
    const key = SELECT_KEYS[category];
    selection[key] = selection[key] === id ? null : id;
    if (category === 'panels') panelQty = null;
    const ok = await runQuote();
    if (!ok) {
      selection = prev;
      if (lastQuote) renderQuote(lastQuote);
    }
  }

  document.getElementById('quoteResults').addEventListener('click', (e) => {
    if (e.target.closest('.qty-input')) return;
    const target = e.target.closest('.candidate');
    if (target && target.dataset.id) {
      changeSelection(target.dataset.cat, Number(target.dataset.id));
      return;
    }
    if (e.target.closest('.reset-selection')) {
      selection = { inverter_id: null, battery_id: null, panel_id: null };
      panelQty = null;
      runQuote();
    }
  });

  document.getElementById('quoteResults').addEventListener('change', (e) => {
    const input = e.target.closest('.qty-input');
    if (!input) return;
    const qty = Math.floor(Number(input.value));
    const s = lastQuote && lastQuote.strings;
    const maxQty = s ? Number(s.max_qty) : 200;
    if (!Number.isFinite(qty) || qty < 1 || qty > maxQty) {
      input.value = input.dataset.prev || input.value;
      showToast(t('invalid_panel_qty'), true);
      return;
    }
    if (!qtyFormsStrings(qty, s)) {
      input.value = input.dataset.prev || input.value;
      showToast(t('panel_qty_string_mismatch'), true);
      return;
    }
    panelQty = qty;
    input.dataset.prev = String(qty);
    runQuote();
  });

  function renderQuote(d) {
    const el = document.getElementById('quoteResults');
    const exact = d.is_exact && d.exact;

    let html = '<div class="card">';

    if (exact) {
      html += `<h3 class="card-title">${t('exact_price')}</h3>
        <div class="range-box">
          <div class="range-values"><span class="range-amount">${fmtUsd(exact.total_usd)}</span></div>
          <div class="range-meta">≈ ${fmtKhr(exact.total_khr)}</div>
        </div>`;
    } else {
      html += `<h3 class="card-title">${t('price_range')}</h3>
        <div class="range-box">
          <div class="range-values">
            <span class="range-amount">${fmtUsd(d.price_range.min_usd)}</span>
            <span class="range-sep">–</span>
            <span class="range-amount">${fmtUsd(d.price_range.max_usd)}</span>
          </div>
          <div class="range-meta">≈ ${fmtKhr(d.price_range.min_khr)} – ${fmtKhr(d.price_range.max_khr)} · ${t('combo_count')}: ${d.combo_count}</div>
        </div>`;
    }

    const hardware = exact
      ? { min: exact.hardware_usd, max: exact.hardware_usd }
      : d.hardware_range;
    const installation = exact
      ? { min: exact.installation_usd, max: exact.installation_usd }
      : d.installation_range;

    html += `<div class="metric-grid">
      <div class="metric"><div class="label">${t('hardware_range')}</div><div class="value">${fmtRange(hardware.min, hardware.max, fmtUsd)}</div></div>
      <div class="metric"><div class="label">${t('installation_fee')}</div><div class="value">${fmtRange(installation.min, installation.max, fmtUsd)}</div></div>
      <div class="metric"><div class="label">${t('day_energy')}</div><div class="value">${fmtNum(d.calculation.day_energy_kwh, 'kWh')}</div></div>
      <div class="metric"><div class="label">${t('night_energy')}</div><div class="value">${fmtNum(d.calculation.night_energy_kwh, 'kWh')}</div></div>
      <div class="metric"><div class="label">${t('battery_needed')}</div><div class="value">${batteryNeededText(d.calculation)}</div></div>
      <div class="metric"><div class="label">${t('inverter_needed')}</div><div class="value">${fmtNum(d.calculation.inverter_power_needed, 'W')}</div></div>
      <div class="metric"><div class="label">${t('solar_needed')}</div><div class="value">${fmtSolarWatts(d.calculation.solar_power_needed)}</div></div>
      <div class="metric"><div class="label">${t('peak_sun')}</div><div class="value">${fmtNum(d.calculation.peak_sun_hours, 'h')}</div></div>
    </div>`;

    if (d.strings) {
      const s = d.strings;
      html += `<div class="metric-grid">
        <div class="metric"><div class="label">${t('string_config')}</div><div class="value">${s.series} × ${s.parallel}</div></div>
        <div class="metric"><div class="label">${t('string_voltage_current')}</div><div class="value">${fmtNum(s.string_voc_v, 'V')} / ${fmtNum(s.string_current_a, 'A')}</div></div>
        <div class="metric"><div class="label">${t('string_mppt_limit')}</div><div class="value">${fmtNum(s.mppt_max_voltage_v, 'V')} / ${fmtNum(s.mppt_max_current_a, 'A')} × ${s.mppt_channels}</div></div>
      </div>`;
    }

    if (d.case) {
      html += `<div class="select-note" style="margin-bottom:10px">${t('select_case')}: ${(d.case.name ? d.case.name + ' · ' : '') + d.case.address} · ${d.case.install_type === 'ground' ? t('install_ground') : t('install_rooftop')} · ${d.case.system_mode === 'hybrid' ? t('hybrid') : t('off_grid')}</div>`;
    }

    if (exact) {
      exact.items.forEach((item) => {
        html += `<div class="price-row">
          <span>${categoryLabel(item.category)} × ${item.quantity} · ${item.product.brand}${item.product.model ? ' ' + item.product.model : ''}</span>
          <span>${fmtUsd(item.subtotal_usd)}</span>
        </div>`;
      });
      html += `<div class="price-row"><span>${t('installation_fee')}</span><span>${fmtUsd(exact.installation_usd)}</span></div>
        <div class="price-row total"><span>${t('exact_price')}</span><span>${fmtUsd(exact.total_usd)}</span></div>`;
    }

    if (d.candidates) {
      html += `<div class="candidate-group">
        <h4>${t('candidates')}</h4>
        <div class="select-note">${exact ? t('exact_ready') : t('select_to_narrow')}</div>
        <button class="link-btn reset-selection">${t('reset_selection')}</button>
        ${renderCandidateGroup(d, 'inverters')}
        ${renderCandidateGroup(d, 'batteries')}
        ${renderCandidateGroup(d, 'panels')}
      </div>`;
    }

    if (d.pbp || d.pbp_range) {
      html += `<div class="pbp-card"><h3>${t('pbp')}</h3>`;
      if (d.pbp) {
        html += `<div class="pbp-row"><span>${t('pbp_consumption')} · ${t('annual_savings')} ${fmtUsd(d.pbp.consumption.annual_savings_usd)}</span><strong>${fmtNum(d.pbp.consumption.payback_years)} ${t('payback_years')}</strong></div>
          <div class="pbp-row"><span>${t('pbp_generation')} · ${t('annual_savings')} ${fmtUsd(d.pbp.generation.annual_savings_usd)}</span><strong>${fmtNum(d.pbp.generation.payback_years)} ${t('payback_years')}</strong></div>`;
      } else {
        const c = d.pbp_range.consumption;
        const g = d.pbp_range.generation;
        html += `<div class="pbp-row"><span>${t('pbp_consumption')}</span><strong>${fmtNum(c.min_years)} – ${fmtNum(c.max_years)} ${t('payback_years')}</strong></div>
          <div class="pbp-row"><span>${t('pbp_generation')}</span><strong>${fmtNum(g.min_years)} – ${fmtNum(g.max_years)} ${t('payback_years')}</strong></div>`;
      }
      html += '</div>';
    } else if (d.pbp_unavailable_reason) {
      html += `<div class="cta-box"><p>${t('electricity_price_not_set')}</p></div>`;
    }

    if (d.notes && d.notes.length) {
      html += '<ul class="notes">';
      d.notes.forEach((n) => {
        html += `<li>${t(n).replace('{psh}', d.calculation.peak_sun_hours)}</li>`;
      });
      html += '</ul>';
    }

    html += '</div>';
    el.innerHTML = html;
  }

  function renderCandidateGroup(d, category) {
    let list = d.candidates[category] || [];
    const key = SELECT_KEYS[category];

    if (category === 'batteries' && selection.inverter_id) {
      const inv = (d.candidates.inverters || []).find((p) => p.id === selection.inverter_id);
      if (inv) {
        const voltage = Number(parseFloat(inv.battery_voltage));
        list = list.filter((p) => Number(p.nominal_voltage) === voltage);
      }
    }
    if (category === 'inverters' && selection.battery_id) {
      const bat = (d.candidates.batteries || []).find((p) => p.id === selection.battery_id);
      if (bat) {
        const voltage = Number(bat.nominal_voltage);
        list = list.filter((p) => Number(parseFloat(p.battery_voltage)) === voltage);
      }
    }

    if (!list.length) return '';

    const title = category === 'inverters' ? t('inverter') : category === 'batteries' ? t('battery') : t('solar_panel');
    const items = list.map((p) => {
      const selected = selection[key] === p.id;
      let priceHtml = `<span class="price">${fmtUsd(p.price_usd)}</span>`;
      if (category === 'panels' && selected) {
        const qty = panelQty !== null ? panelQty : (Number(p.required_qty) || 1);
        const maxQty = d.strings ? Number(d.strings.max_qty) : 200;
        priceHtml = `<span class="price-wrap">
          <span class="price">${fmtUsd(p.price_usd)}</span>
          <span class="qty-x">×</span>
          <input class="qty-input" type="number" min="1" max="${maxQty}" step="1" value="${qty}" data-prev="${qty}" aria-label="${escapeHtml(t('quantity'))}" />
        </span>`;
      }
      return `<div class="candidate${selected ? ' selected' : ''}" data-cat="${category}" data-id="${p.id}">
        <div class="candidate-main"><strong>${productTitle(category, p)}</strong><span>${candidateMeta(category, p)}</span></div>
        ${priceHtml}
      </div>`;
    }).join('');

    return `<div class="candidate-group"><h4>${title}</h4><div class="candidate-list">${items}</div></div>`;
  }

  function parUnits(n) {
    return Number(n) > 1 ? `×${Number(n)}` : t('no');
  }

  function productTitle(category, p) {
    const base = `${p.brand}${p.model ? ' ' + p.model : ''}`;
    if (category === 'inverters') {
      return `${base} · ${p.type === 'hybrid' ? t('hybrid') : t('off_grid')} · ${p.rated_power}W · ${p.battery_voltage}`;
    }
    if (category === 'batteries') {
      return `${base} · ${battTypeLabel(p.type)} · ${fmtDec1(p.capacity_kwh)}kWh · ${fmtDec1(p.discharge_rate)}C · ${fmtDec1(p.nominal_voltage)}V`;
    }
    const tech = Array.isArray(p.technology) && p.technology.length ? ' · ' + p.technology.join('/') : '';
    return `${base} · ${p.rated_power}W · ${glassLabel(p.glass_type)}${tech}`;
  }

  function candidateMeta(category, p) {
    if (category === 'inverters') {
      const qtyInfo = p.required_qty && p.required_qty > 1 ? ` × ${p.required_qty}` : '';
      const spec = p.mppt_max_current_a || p.mppt_max_voltage_v
        ? ` (${p.mppt_max_current_a ? fmtDec1(p.mppt_max_current_a) + 'A' : '-'}/${p.mppt_max_voltage_v ? fmtDec1(p.mppt_max_voltage_v) + 'V' : '-'})`
        : '';
      const par = [];
      if (p.type === 'hybrid') par.push(`${t('grid_parallel_short')}: ${parUnits(p.grid_parallel_max)}`);
      par.push(`${t('offgrid_parallel_short')}: ${parUnits(p.offgrid_parallel_max)}`);
      return `MPPT×${p.mppt_channels}${spec}${qtyInfo} · ${par.join(' · ')}`;
    }
    if (category === 'batteries') {
      return `${t('bms_brand')}: ${p.bms_brand || '-'} · ${t('parallel_supported')}: ${Number(p.parallel_supported) ? t('yes') : t('no')}`;
    }
    const kwpInfo = p.total_kwp ? `= ${fmtDec1(p.total_kwp)}kWp` : '';
    const size = [p.length_mm, p.width_mm, p.height_mm].every((v) => v !== null && v !== undefined && v !== '')
      ? `${p.length_mm}×${p.width_mm}×${p.height_mm}mm`
      : '';
    return `${kwpInfo}${kwpInfo && size ? ' · ' : ''}${size}` || '-';
  }

  /* ===================== Catalog ===================== */

  document.getElementById('catalogToggle').addEventListener('click', () => {
    const body = document.getElementById('catalogBody');
    const visible = body.style.display === 'none';
    body.style.display = visible ? '' : 'none';
    if (visible && !catalogLoaded) loadCatalog();
  });

  document.querySelectorAll('#catalogTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#catalogTabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      catalogCat = btn.dataset.cat;
      loadCatalog();
    });
  });

  async function loadCatalog() {
    const list = document.getElementById('catalogList');
    list.innerHTML = `<div class="empty-state">${t('loading')}</div>`;
    try {
      const data = await api('/pv/api/products/' + catalogCat, { auth: false });
      catalogLoaded = true;
      if (!data.length) {
        list.innerHTML = `<div class="empty-state">${t('no_data')}</div>`;
        return;
      }
      list.innerHTML = data.map((p) => `<div class="catalog-card">
        <h4>${productTitle(catalogCat, p)}</h4>
        <div class="meta">${catalogMeta(p)}</div>
        <div class="price">${fmtUsd(p.price_usd)}${Number(p.price_khr) > 0 ? ' / ' + fmtKhr(p.price_khr) : ''}</div>
      </div>`).join('');
    } catch (e) {
      list.innerHTML = `<div class="empty-state">${errMsg(e)}</div>`;
    }
  }

  function catalogMeta(p) {
    if (catalogCat === 'inverters') {
      const spec = p.mppt_max_current_a || p.mppt_max_voltage_v
        ? ` (${p.mppt_max_current_a ? fmtDec1(p.mppt_max_current_a) + 'A' : '-'}/${p.mppt_max_voltage_v ? fmtDec1(p.mppt_max_voltage_v) + 'V' : '-'})`
        : '';
      const par = [];
      if (p.type === 'hybrid') par.push(`${t('grid_parallel_short')}: ${parUnits(p.grid_parallel_max)}`);
      par.push(`${t('offgrid_parallel_short')}: ${parUnits(p.offgrid_parallel_max)}`);
      return `MPPT×${p.mppt_channels}${spec} · ${par.join(' · ')} · ${t('warranty')}: ${p.warranty_months}${t('months')}`;
    }
    if (catalogCat === 'panels') {
      const parts = [];
      if ([p.length_mm, p.width_mm, p.height_mm].every((v) => v !== null && v !== undefined && v !== '')) {
        parts.push(`${p.length_mm}×${p.width_mm}×${p.height_mm}mm`);
      }
      if (p.voc_v) parts.push(`Voc ${fmtDec1(p.voc_v)}V`);
      if (p.isc_a) parts.push(`Isc ${fmtDec1(p.isc_a)}A`);
      parts.push(`${t('warranty')}: ${p.warranty_months}${t('months')}`);
      return parts.join(' · ');
    }
    return `${t('bms_brand')}: ${p.bms_brand || '-'} · ${t('parallel_supported')}: ${Number(p.parallel_supported) ? t('yes') : t('no')} · ${t('warranty')}: ${p.warranty_months}${t('months')}`;
  }

  /* ===================== Config / language / bootstrap ===================== */

  async function loadConfig() {
    try {
      const r = await fetch('/pv/api/config');
      config = await r.json();
    } catch (e) {
      config = { usd_to_khr: 4100 };
    }
  }

  function initLang() {
    const lang = getCurrentLang();
    if (window.updateLangPicker) window.updateLangPicker(lang);
    applyLang();
  }

  document.addEventListener('lang:change', (e) => {
    setLang(e.detail.lang);
    initLang();
    renderCaseList();
    updateScenarioHint();
    updateAutonomyWarning();
    const activeCase = cases.find((x) => x.id === activeCaseId);
    if (activeCase && document.getElementById('loadBuilderCard').style.display !== 'none') {
      document.getElementById('scenarioGuide').textContent = t('scenario_' + activeCase.usage_scenario + '_guide');
      renderLoadRows();
      refreshLoadSummary();
    }
    if (lastQuote) renderQuote(lastQuote);
    if (snapshotNoteKey) setSnapshotNoteKey(snapshotNoteKey);
    if (catalogLoaded && document.getElementById('catalogBody').style.display !== 'none') loadCatalog();
  });

  async function bootstrap() {
    initLang();
    updateAutonomyWarning();
    await loadCountries();
    fillPhoneCountries();
    setAuthMode('login');
    updateLoginMethod();
    await loadConfig();
    const user = await loadMe();
    if (user) showPanel();
    else showAuth();
  }

  if (document.readyState === 'complete') {
    bootstrap();
  } else {
    window.addEventListener('load', bootstrap);
  }
})();
