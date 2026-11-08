// Guest configurator: estimated price range only
(function () {
  let lastResult = null;

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

  function renderResult(d) {
    const el = document.getElementById('results');
    el.innerHTML = `<div class="card">
      <h3 class="card-title">${t('price_range')}</h3>
      <div class="range-box">
        <div class="range-values">
          <span class="range-amount">${fmtUsd(d.price_range.min_usd)}</span>
          <span class="range-sep">–</span>
          <span class="range-amount">${fmtUsd(d.price_range.max_usd)}</span>
        </div>
        <div class="range-meta">≈ ${fmtKhr(d.price_range.min_khr)} – ${fmtKhr(d.price_range.max_khr)} · ${t('combo_count')}: ${d.combo_count}</div>
      </div>
      <div class="metric-grid">
        <div class="metric"><div class="label">${t('hardware_range')}</div><div class="value">${fmtUsd(d.hardware_range.min_usd)} – ${fmtUsd(d.hardware_range.max_usd)}</div></div>
        <div class="metric"><div class="label">${t('installation_fee')}</div><div class="value">${fmtUsd(d.installation_range.min_usd)} – ${fmtUsd(d.installation_range.max_usd)}</div></div>
        <div class="metric"><div class="label">${t('day_energy')}</div><div class="value">${fmtNum(d.calculation.day_energy_kwh, 'kWh')}</div></div>
        <div class="metric"><div class="label">${t('night_energy')}</div><div class="value">${fmtNum(d.calculation.night_energy_kwh, 'kWh')}</div></div>
        <div class="metric"><div class="label">${t('battery_needed')}</div><div class="value">${fmtNum(d.calculation.battery_kwh_needed, 'kWh')}</div></div>
        <div class="metric"><div class="label">${t('solar_needed')}</div><div class="value">${fmtNum(d.calculation.solar_power_needed, 'W')}</div></div>
      </div>
      <div class="cta-box">
        <p>${t('guest_notice')}</p>
        <a class="btn btn-primary btn-sm" href="/member" style="width:auto;text-decoration:none">${t('register_for_exact')}</a>
      </div>
      ${d.notes && d.notes.length ? `<ul class="notes">${d.notes.map((n) => `<li>${t(n).replace('{psh}', d.calculation.peak_sun_hours)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  async function calculate() {
    const dayPower = parseFloat(document.getElementById('dayPower').value);
    const dayHours = parseFloat(document.getElementById('dayHours').value);
    const nightPower = parseFloat(document.getElementById('nightPower').value);
    const nightHours = parseFloat(document.getElementById('nightHours').value);
    if (!Number.isFinite(dayPower) || dayPower <= 0) {
      showToast(t('invalid_day_peak_power'), true);
      return;
    }
    if (!Number.isFinite(dayHours) || dayHours < 0) {
      showToast(t('invalid_day_hours'), true);
      return;
    }
    if (Number.isFinite(nightHours) && nightHours > 0 && (!Number.isFinite(nightPower) || nightPower <= 0)) {
      showToast(t('invalid_night_peak_power'), true);
      return;
    }
    if ((!dayHours || dayHours <= 0) && (!nightHours || nightHours <= 0)) {
      showToast(t('invalid_daily_hours'), true);
      return;
    }

    const btn = document.getElementById('calcBtn');
    const original = btn.textContent;
    btn.textContent = t('calculating');
    btn.disabled = true;

    try {
      const body = {
        day_peak_power: dayPower,
        day_hours: dayHours || 0,
        night_peak_power: Number.isFinite(nightPower) ? nightPower : 0,
        night_hours: Number.isFinite(nightHours) ? nightHours : 0,
        autonomy_days: parseFloat(document.getElementById('autonomyDays').value) || 1,
        strategy: Number(document.getElementById('strategy').value) || 2,
      };
      const batteryType = document.getElementById('batteryType').value;
      if (batteryType) body.battery_type = batteryType;

      const r = await fetch('/api/quote', {
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
        document.getElementById('results').innerHTML = `<div class="card quote-error">${errMsg(data)}</div>`;
      }
    } catch (e) {
      document.getElementById('results').innerHTML = `<div class="card empty-state">${t('error')}</div>`;
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  }

  function showToast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = isError ? 'var(--danger)' : 'var(--success)';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }

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

  function initLang() {
    const lang = getCurrentLang();
    document.querySelectorAll('#langSwitcher button').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
    applyLang();
    updateAutonomyWarning();
    if (lastResult) renderResult(lastResult);
  }

  document.querySelectorAll('#langSwitcher button').forEach((b) => {
    b.addEventListener('click', () => {
      setLang(b.dataset.lang);
      initLang();
    });
  });

  document.getElementById('calcBtn').addEventListener('click', calculate);
  document.getElementById('autonomyDays').addEventListener('input', updateAutonomyWarning);

  /* ===================== Tips ===================== */
  function openTip(kind) {
    document.getElementById('tipTitle').textContent = t('tip_' + kind + '_title');
    document.getElementById('tipBody').innerHTML = t('tip_' + kind + '_body');
    document.getElementById('tipModal').classList.add('active');
  }
  document.querySelectorAll('.info-btn[data-tip]').forEach((b) => {
    b.addEventListener('click', () => openTip(b.dataset.tip));
  });
  document.getElementById('tipClose').addEventListener('click', () => {
    document.getElementById('tipModal').classList.remove('active');
  });

  function bootstrap() {
    initLang();
  }
  if (document.readyState === 'complete') {
    bootstrap();
  } else {
    window.addEventListener('load', bootstrap);
  }
})();
