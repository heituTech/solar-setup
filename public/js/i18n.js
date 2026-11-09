// i18n runtime. The COMPLETE dictionary bundle (js/i18n/all.js, all languages
// nested by language code) is downloaded exactly once on the first visit and
// persisted into IndexedDB. Language switches read the target dictionary
// straight from IndexedDB (and swap it into memory), so switching is instant
// and never touches the network — translations never come from the backend.
(function () {
  const LANGS = ['km', 'en', 'zh', 'es', 'de', 'fr', 'ja', 'ko', 'th', 'vi'];
  // Bump this whenever js/i18n/all.js content changes so browsers refresh
  // their IndexedDB cache from the new bundle.
  const DICT_VERSION = 6;
  const DB_NAME = 'solar_i18n';
  const STORE_DICTS = 'dicts';
  const STORE_META = 'meta';

  // window.I18N holds ONLY the current language dictionary (flat map).
  window.I18N = {};

  window.getCurrentLang = () => localStorage.getItem('lang') || 'en';

  // Voltage / current display: at most one decimal, drop trailing .0
  window.fmtDec1 = function (value) {
    if (value === null || value === undefined || value === '') return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };

  window.t = function (key) {
    const dict = window.I18N;
    return dict && dict[key] !== undefined ? dict[key] : key;
  };

  window.applyLang = function () {
    const lang = window.getCurrentLang();
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = window.t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', window.t(key));
    });
  };

  /* ===================== IndexedDB helpers ===================== */
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_DICTS)) db.createObjectStore(STORE_DICTS);
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function idbGet(store, key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const req = db.transaction(store, 'readonly').objectStore(store).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbSet(store, key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* ===================== Dictionary loading ===================== */
  let bundlePromise = null;
  function loadBundle() {
    if (bundlePromise) return bundlePromise;
    bundlePromise = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = '/pv/js/i18n/all.js?v=' + DICT_VERSION;
      s.async = false; // keep execution order deterministic
      s.onload = function () { resolve(window.I18N_DICTS || {}); };
      s.onerror = function () { reject(new Error('Failed to load dictionary bundle')); };
      document.head.appendChild(s);
    });
    return bundlePromise;
  }

  // Download the bundle once and persist every language into IndexedDB.
  function fetchAndStoreAll() {
    return loadBundle().then(function (all) {
      const writes = LANGS.map(function (l) {
        return all[l] ? idbSet(STORE_DICTS, l, all[l]) : Promise.resolve();
      });
      writes.push(idbSet(STORE_META, 'version', DICT_VERSION));
      return Promise.all(writes).then(function () { return all; });
    });
  }

  function swapDict(lang, dict) {
    window.I18N = dict || {};
    window.applyLang();
  }

  // Bootstrap: resolve once the dictionary of the current language is in
  // memory. Pages must await this before their first render.
  window.I18N_READY = (async function () {
    const lang = window.getCurrentLang();
    try {
      const version = await idbGet(STORE_META, 'version');
      let dict = version === DICT_VERSION ? await idbGet(STORE_DICTS, lang) : null;
      if (!dict) {
        const all = await fetchAndStoreAll();
        dict = all[lang] || all.en || {};
      }
      swapDict(lang, dict);
    } catch (err) {
      console.error(err);
      // Last-resort fallback: load the bundle straight into memory so the UI
      // still renders (e.g. IndexedDB blocked in private mode).
      try {
        const all = await loadBundle();
        swapDict(lang, all[lang] || all.en || {});
      } catch (err2) {
        console.error(err2);
      }
    }
    return window.I18N;
  })();

  // Persist the choice, pull the target dictionary from IndexedDB (instant),
  // swap it into memory and re-apply translations. Returns a promise so pages
  // can re-render dynamic content afterwards.
  window.setLang = async function (lang) {
    if (LANGS.indexOf(lang) === -1) lang = 'en';
    localStorage.setItem('lang', lang);
    let dict = null;
    try {
      dict = await idbGet(STORE_DICTS, lang);
    } catch (err) {
      console.error(err);
    }
    if (!dict) {
      // Bundle not cached yet (e.g. switch raced the bootstrap) — fetch it
      // once and persist everything.
      try {
        const all = await fetchAndStoreAll();
        dict = all[lang] || all.en || {};
      } catch (err) {
        console.error(err);
        try {
          const all = await loadBundle();
          dict = all[lang] || all.en || {};
        } catch (err2) {
          console.error(err2);
          dict = {};
        }
      }
    }
    swapDict(lang, dict);
  };

  window.I18N_LANGS = LANGS;
})();
