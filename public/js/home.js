// Landing page: apply saved language and keep the picker in sync
(function () {
  // First render happens only after the dictionary is in memory (loaded from
  // IndexedDB, or downloaded once into IndexedDB on the very first visit).
  window.I18N_READY.then(function () {
    window.applyLang();
    if (window.updateLangPicker) window.updateLangPicker(window.getCurrentLang());
  });

  document.addEventListener('lang:change', function (e) {
    // setLang pulls the dictionary from IndexedDB and swaps it in instantly.
    window.setLang(e.detail.lang);
    if (window.updateLangPicker) window.updateLangPicker(e.detail.lang);
  });
})();
