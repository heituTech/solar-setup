// Staff self-service account page: profile display, verified phone/email changes,
// and logout (moved here from the staff portal).
(function () {
  const TOKEN_KEY = 'staff_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let me = null;
  let countries = [];
  let codeTimer = null;
  let pwdTimer = null;

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
    if (r.status === 401) throw { status: 401, error: 'unauthorized' };
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

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getCountry(code) {
    return countries.find((c) => c.code === String(code || '').toUpperCase()) || null;
  }

  // Stored phones are E.164-style (+855...). Show the national part in the input.
  function nationalPhone(phone, countryCode) {
    const country = getCountry(countryCode) || getCountry('KH');
    let digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (String(phone || '').startsWith('+') && country && digits.startsWith(country.dial)) {
      digits = digits.slice(country.dial.length);
    }
    return digits;
  }

  function fillPhoneCountries(selectedCode) {
    const select = document.getElementById('a_phone_country');
    const list = countries.length ? countries : [{ code: 'KH', dial: '855', name: 'Cambodia' }];
    select.innerHTML = list
      .map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.name)} +${escapeHtml(c.dial)}</option>`)
      .join('');
    select.value = list.some((c) => c.code === selectedCode)
      ? selectedCode
      : (list.some((c) => c.code === 'KH') ? 'KH' : list[0].code);
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

  function startPwdCooldown(btn, seconds) {
    if (pwdTimer) clearInterval(pwdTimer);
    let left = seconds;
    btn.disabled = true;
    btn.textContent = left + 's';
    pwdTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(pwdTimer);
        pwdTimer = null;
        btn.disabled = false;
        btn.textContent = t('send_code');
      } else {
        btn.textContent = left + 's';
      }
    }, 1000);
  }

  /* ===================== Form state ===================== */

  function phoneChanged() {
    if (!me) return false;
    const country = document.getElementById('a_phone_country').value;
    const originalCountry = String(me.phone_country || 'KH').toUpperCase();
    if (country !== originalCountry) return true;
    const typed = String(document.getElementById('a_phone').value || '').replace(/\D/g, '');
    return typed !== nationalPhone(me.phone, originalCountry);
  }

  function emailChanged() {
    if (!me) return false;
    const email = document.getElementById('a_email').value.trim().toLowerCase();
    return email !== String(me.email || '').toLowerCase();
  }

  function updateCodeField() {
    document.getElementById('a_codeField').style.display = phoneChanged() || emailChanged() ? '' : 'none';
  }

  function updateIdentity() {
    if (!me) return;
    document.getElementById('accountName').textContent = me.username || me.email || '';
    const badge = document.getElementById('accountRoleBadge');
    badge.textContent = t('role_' + me.role);
    badge.className = 'role-badge role-' + me.role;
  }

  function fillForm() {
    if (!me) return;
    const country = String(me.phone_country || 'KH').toUpperCase();
    document.getElementById('a_username').value = me.username || '';
    document.getElementById('a_full_name').value = me.full_name || '';
    fillPhoneCountries(country);
    document.getElementById('a_phone').value = nationalPhone(me.phone, country);
    document.getElementById('a_email').value = me.email || '';
    document.getElementById('a_code').value = '';
    document.getElementById('a_devHint').style.display = 'none';
    document.getElementById('p_email').value = me.email || '';
    updateCodeField();
  }

  /* ===================== Actions ===================== */

  document.getElementById('a_phone').addEventListener('input', updateCodeField);
  document.getElementById('a_email').addEventListener('input', updateCodeField);
  document.getElementById('a_phone_country').addEventListener('change', updateCodeField);

  document.getElementById('a_sendCode').addEventListener('click', async () => {
    const email = document.getElementById('a_email').value.trim();
    if (!email) {
      showToast(t('email'), true);
      return;
    }
    const btn = document.getElementById('a_sendCode');
    try {
      const { data } = await api('/pv/api/auth/profile-code', { method: 'POST', body: { email } });
      showToast(t('code_sent'));
      if (data.dev_mode) document.getElementById('a_devHint').style.display = '';
      document.getElementById('a_codeField').style.display = '';
      startCooldown(btn, 60);
    } catch (e) {
      if (e.status === 401) return redirectToLogin();
      showToast(errMsg(e), true);
    }
  });

  document.getElementById('a_save').addEventListener('click', async () => {
    if (!me) return;
    const fullName = document.getElementById('a_full_name').value.trim();
    const phone = document.getElementById('a_phone').value.trim();
    const country = document.getElementById('a_phone_country').value;
    const email = document.getElementById('a_email').value.trim();
    const emailIsChanged = emailChanged();
    const changed = phoneChanged() || emailIsChanged;

    if (!fullName) {
      showToast(t('full_name_required'), true);
      return;
    }
    if (!phone) {
      showToast(t('invalid_phone'), true);
      return;
    }

    const body = { full_name: fullName, phone, phone_country: country };
    if (changed) {
      if (!email) {
        showToast(t('invalid_email'), true);
        return;
      }
      const code = document.getElementById('a_code').value.trim();
      if (!/^\d{6}$/.test(code)) {
        showToast(t('invalid_code'), true);
        return;
      }
      if (emailIsChanged) body.email = email;
      body.code = code;
    }

    try {
      const { data } = await api('/pv/api/auth/me', { method: 'PATCH', body });
      me = data.user;
      updateIdentity();
      fillForm();
      showToast(t('profile_saved'));
    } catch (e) {
      if (e.status === 401) return redirectToLogin();
      showToast(errMsg(e), true);
    }
  });

  function redirectToLogin() {
    localStorage.removeItem(TOKEN_KEY);
    location.replace('/pv/admin');
  }

  /* ===================== Change login password ===================== */

  document.getElementById('p_sendCode').addEventListener('click', async () => {
    if (!me || !me.email) {
      showToast(t('email_required'), true);
      return;
    }
    const btn = document.getElementById('p_sendCode');
    try {
      const { data } = await api('/pv/api/auth/password-code', { method: 'POST', body: {} });
      showToast(t('code_sent'));
      if (data.dev_mode) document.getElementById('p_devHint').style.display = '';
      startPwdCooldown(btn, 60);
    } catch (e) {
      if (e.status === 401) return redirectToLogin();
      showToast(errMsg(e), true);
    }
  });

  document.getElementById('p_save').addEventListener('click', async () => {
    const code = document.getElementById('p_code').value.trim();
    const password = document.getElementById('p_password').value;
    const confirm = document.getElementById('p_confirm').value;
    if (!/^\d{6}$/.test(code)) {
      showToast(t('invalid_code'), true);
      return;
    }
    if (password.length < 8) {
      showToast(t('password_too_short'), true);
      return;
    }
    if (password !== confirm) {
      showToast(t('password_mismatch'), true);
      return;
    }
    try {
      await api('/pv/api/auth/password', { method: 'PATCH', body: { code, new_password: password } });
      document.getElementById('p_code').value = '';
      document.getElementById('p_password').value = '';
      document.getElementById('p_confirm').value = '';
      document.getElementById('p_devHint').style.display = 'none';
      showToast(t('password_updated'));
    } catch (e) {
      if (e.status === 401) return redirectToLogin();
      showToast(errMsg(e), true);
    }
  });

  document.getElementById('accountLogoutBtn').addEventListener('click', redirectToLogin);

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
      updateIdentity();
    });
  });

  async function loadMe() {
    if (!token) return null;
    const { data } = await api('/pv/api/auth/me');
    if (!data.user || data.user.role === 'member') return null;
    return data.user;
  }

  async function bootstrap() {
    // Render only after the dictionary is in memory (IndexedDB-backed).
    await window.I18N_READY;
    initLang();
    try {
      const { data } = await api('/pv/api/config/countries', { auth: false });
      countries = Array.isArray(data.countries) ? data.countries : [];
    } catch (e) {
      countries = [];
    }
    try {
      me = await loadMe();
    } catch (e) {
      me = null;
    }
    if (!me) {
      token = '';
      redirectToLogin();
      return;
    }
    updateIdentity();
    fillForm();
  }

  if (document.readyState === 'complete') {
    bootstrap();
  } else {
    window.addEventListener('load', bootstrap);
  }
})();
