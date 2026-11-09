(function () {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const menuBtn = document.getElementById('menuBtn');
  const closeBtn = document.getElementById('sidebarClose');

  /* Keep the fixed app bar from covering content: when translated text wraps
     the header onto a second row (or the viewport resizes), sync body padding. */
  function syncAppBarHeight() {
    const bar = document.querySelector('.app-bar');
    if (bar) document.body.style.paddingTop = bar.offsetHeight + 'px';
  }
  window.addEventListener('resize', syncAppBarHeight);
  window.addEventListener('orientationchange', () => setTimeout(syncAppBarHeight, 100));
  if (document.readyState === 'complete') syncAppBarHeight();
  else window.addEventListener('load', syncAppBarHeight);

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('show');
    menuBtn.setAttribute('aria-expanded', 'true');
    sidebar.setAttribute('aria-hidden', 'false');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
    menuBtn.setAttribute('aria-expanded', 'false');
    sidebar.setAttribute('aria-hidden', 'true');
  }

  if (sidebar && backdrop && menuBtn) {
    menuBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    backdrop.addEventListener('click', closeSidebar);
  }

  /* ===================== Language picker (opens upward) ===================== */
  const LANG_NAMES = {
    km: 'ខ្មែរ',
    en: 'English',
    zh: '中文',
    es: 'Español',
    de: 'Deutsch',
    fr: 'Français',
    ja: '日本語',
    ko: '한국어',
    th: 'ไทย',
    vi: 'Tiếng Việt',
  };
  const langBtn = document.getElementById('langCurrentBtn');
  const langMenu = document.getElementById('langMenu');
  const langFlag = document.getElementById('langCurrentFlag');

  function closeLangMenu() {
    if (!langMenu || !langBtn) return;
    langMenu.hidden = true;
    langBtn.setAttribute('aria-expanded', 'false');
  }

  // The collapsed picker shows only the flag of the selected language;
  // menu options stay text-only.
  window.updateLangPicker = function (lang) {
    if (langFlag) {
      langFlag.src = '/pv/img/flags/' + lang + '.svg';
      langFlag.alt = LANG_NAMES[lang] || LANG_NAMES.en;
      langFlag.title = LANG_NAMES[lang] || LANG_NAMES.en;
    }
    if (!langMenu) return;
    langMenu.querySelectorAll('.lang-option').forEach(function (opt) {
      const selected = opt.dataset.lang === lang;
      opt.classList.toggle('active', selected);
      opt.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  };

  if (langBtn && langMenu) {
    langBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (langMenu.hidden) {
        langMenu.hidden = false;
        langBtn.setAttribute('aria-expanded', 'true');
      } else {
        closeLangMenu();
      }
    });

    langMenu.addEventListener('click', function (e) {
      const opt = e.target.closest('.lang-option');
      if (!opt) return;
      closeLangMenu();
      document.dispatchEvent(new CustomEvent('lang:change', { detail: { lang: opt.dataset.lang } }));
    });

    document.addEventListener('click', function (e) {
      if (!langMenu.hidden && !e.target.closest('.lang-picker')) closeLangMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeLangMenu();
        if (sidebar && backdrop && menuBtn) closeSidebar();
      }
    });
  }

  /* ===================== Header account link ===================== */
  // Guests see "Sign In"; signed-in members/staff see "My Account". Both point at
  // /pv/member, which renders the login form or the member panel as needed.
  (function () {
    const link = document.getElementById('headerAccountLink');
    if (!link) return;
    const signedIn = !!(localStorage.getItem('member_token') || localStorage.getItem('staff_token'));
    link.dataset.i18n = signedIn ? 'my_account' : 'sign_in';
    const refresh = function () {
      if (window.applyLang) window.applyLang();
    };
    if (window.I18N_READY && window.I18N_READY.then) window.I18N_READY.then(refresh);
    else refresh();
  })();
})();
