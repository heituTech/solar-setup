// User configurator page logic
(function () {
  let config = {};
  let lastResult = null;

  async function loadConfig() {
    try {
      const r = await fetch('/api/config');
      config = await r.json();
    } catch (e) {
      config = { default_currency: 'USD', usd_to_khr: '4100' };
    }
  }

  function fmtMoney(usd, khr) {
    const cur = (config.default_currency || 'USD').toUpperCase();
    if (cur === 'KHR') {
      const khrVal = khr && Number(khr) > 0 ? Number(khr) : Number(usd) * Number(config.usd_to_khr || 4100);
      return khrVal.toLocaleString() + ' KHR';
    }
    return '$' + Number(usd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtNum(n, unit) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return Number(n).toLocaleString() + (unit ? ' ' + unit : '');
  }

  function battTypeLabel(type) {
    const map = {
      'lead-acid': t('battery_lead_acid'),
      'lfp': t('battery_lfp'),
      'lithium-ternary': t('battery_ternary'),
    };
    return map[type] || type;
  }

  function invTypeLabel(type) {
    return type === 'hybrid' ? t('hybrid') : t('off_grid');
  }

  function glassLabel(g) {
    return g === 'double' ? t('double_glass') : t('single_glass');
  }

  function renderResult(data) {
    const el = document.getElementById('results');
    if (!data.items || data.items.length === 0) {
      el.innerHTML = `<div class="card empty-state">${t('no_data')}</div>`;
      return;
    }

    const c = data.calculation;
    let html = '';

    // Calculation summary
    html += `<div class="card calc-summary">
      <h4>${t('calc_summary')}</h4>
      <div class="spec-grid">
        <span class="label">${t('daily_energy')}</span><span class="value">${fmtNum(c.daily_energy_wh, 'Wh')}</span>
        <span class="label">${t('battery_needed')}</span><span class="value">${fmtNum(c.battery_kwh_needed, 'kWh')}</span>
        <span class="label">${t('inverter_needed')}</span><span class="value">${fmtNum(c.inverter_power_needed, 'W')}</span>
        <span class="label">${t('solar_needed')}</span><span class="value">${fmtNum(c.solar_power_needed, 'W')}</span>
        <span class="label">${t('peak_sun')}</span><span class="value">${data.input.peak_sun_hours} h/day</span>
      </div>
    </div>`;

    // Items
    data.items.forEach((item) => {
      const p = item.product;
      const catLabel = item.category === 'inverter' ? t('inverter') : item.category === 'panel' ? t('solar_panel') : t('battery');
      let specs = '';

      if (item.category === 'inverter') {
        specs = `
          <span class="label">${t('brand')}</span><span class="value">${p.brand}</span>
          <span class="label">${t('power')}</span><span class="value">${fmtNum(p.rated_power, 'W')}</span>
          <span class="label">${t('type')}</span><span class="value">${invTypeLabel(p.type)}</span>
          <span class="label">${t('voltage')}</span><span class="value">${p.battery_voltage}</span>
          <span class="label">${t('mppt')}</span><span class="value">${p.mppt_channels}</span>
          <span class="label">${t('warranty')}</span><span class="value">${p.warranty_months} ${t('months')}</span>
        `;
      } else if (item.category === 'panel') {
        const tech = Array.isArray(p.technology) ? p.technology.join(', ') : '';
        specs = `
          <span class="label">${t('brand')}</span><span class="value">${p.brand}</span>
          <span class="label">${t('power')}</span><span class="value">${fmtNum(p.rated_power, 'W')}</span>
          <span class="label">${t('type')}</span><span class="value">${glassLabel(p.glass_type)}</span>
          ${tech ? `<span class="label">${t('technology')}</span><span class="value">${tech}</span>` : ''}
          <span class="label">${t('warranty')}</span><span class="value">${p.warranty_months} ${t('months')}</span>
        `;
      } else {
        specs = `
          <span class="label">${t('brand')}</span><span class="value">${p.brand}</span>
          <span class="label">${t('capacity')}</span><span class="value">${fmtNum(p.capacity_kwh, 'kWh')}</span>
          <span class="label">${t('type')}</span><span class="value">${battTypeLabel(p.type)}</span>
          <span class="label">${t('voltage')}</span><span class="value">${fmtNum(p.nominal_voltage, 'V')}</span>
          <span class="label">${t('discharge_rate')}</span><span class="value">${p.discharge_rate}C</span>
          <span class="label">${t('warranty')}</span><span class="value">${p.warranty_months} ${t('months')}</span>
        `;
      }

      html += `<div class="card result-card">
        <h3>${catLabel} × ${item.quantity}</h3>
        <div class="spec-grid">${specs}</div>
      </div>`;
    });

    // Pricing
    html += `<div class="card">
      <h3 style="margin-bottom:10px;color:var(--primary-dark)">${t('total')}</h3>`;
    data.items.forEach((item) => {
      const catLabel = item.category === 'inverter' ? t('inverter') : item.category === 'panel' ? t('solar_panel') : t('battery');
      html += `<div class="price-row">
        <span>${catLabel} × ${item.quantity}</span>
        <span>${fmtMoney(item.subtotal_usd, item.subtotal_khr)}</span>
      </div>`;
    });
    html += `<div class="price-row total">
        <span>${t('total')}</span>
        <span>${fmtMoney(data.total_usd, data.total_khr)}</span>
      </div>`;

    if (data.notes && data.notes.length) {
      html += `<ul class="notes">`;
      data.notes.forEach((n) => {
        html += `<li>${t(n).replace('{psh}', data.input.peak_sun_hours)}</li>`;
      });
      html += `</ul>`;
    }
    html += `</div>`;

    el.innerHTML = html;
  }

  async function calculate() {
    const load = parseFloat(document.getElementById('loadPower').value);
    const hours = parseFloat(document.getElementById('dailyHours').value);
    if (!load || !hours) {
      showToast(t('error'), true);
      return;
    }
    const btn = document.getElementById('calcBtn');
    const original = btn.textContent;
    btn.textContent = t('calculating');
    btn.disabled = true;

    try {
      const body = {
        load_power: load,
        daily_hours: hours,
        autonomy_days: parseFloat(document.getElementById('autonomyDays').value) || 1,
        battery_type: document.getElementById('batteryType').value || undefined,
        system_voltage: document.getElementById('systemVoltage').value || undefined,
      };
      const r = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (r.ok) {
        lastResult = data;
        renderResult(data);
        window.scrollTo({ top: document.getElementById('results').offsetTop - 20, behavior: 'smooth' });
      } else {
        document.getElementById('results').innerHTML = `<div class="card empty-state">${data.error || t('error')}</div>`;
      }
    } catch (e) {
      document.getElementById('results').innerHTML = `<div class="card empty-state">${t('error')}</div>`;
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  }

  function showToast(msg, isError) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = isError ? 'var(--danger)' : 'var(--success)';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  }

  function initLang() {
    const lang = getCurrentLang();
    document.querySelectorAll('#langSwitcher button').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
    applyLang();
    if (lastResult) renderResult(lastResult);
  }

  document.querySelectorAll('#langSwitcher button').forEach((b) => {
    b.addEventListener('click', () => {
      setLang(b.dataset.lang);
      initLang();
    });
  });

  document.getElementById('calcBtn').addEventListener('click', calculate);
  loadConfig();

  function bootstrap() {
    initLang();
  }
  if (document.readyState === 'complete') {
    bootstrap();
  } else {
    window.addEventListener('load', bootstrap);
  }
})();
