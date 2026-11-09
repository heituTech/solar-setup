// Landing page: apply saved language and keep the picker in sync
(function () {
  window.applyLang();
  if (window.updateLangPicker) window.updateLangPicker(window.getCurrentLang());

  document.addEventListener('lang:change', function (e) {
    window.setLang(e.detail.lang);
    if (window.updateLangPicker) window.updateLangPicker(e.detail.lang);
  });
})();
