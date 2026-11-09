// Custom dropdown for native <select> (native popup styling cannot be controlled by CSS)
(function () {
  var OPEN_CLASS = 'cselect-open';

  function build(select) {
    if (select.dataset.cselectReady) return;
    select.dataset.cselectReady = '1';

    var wrap = document.createElement('div');
    wrap.className = 'cselect';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('cselect-native');
    select.setAttribute('tabindex', '-1');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cselect-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');

    var label = document.createElement('span');
    label.className = 'cselect-label';

    var chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('class', 'cselect-chevron');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('width', '18');
    chevron.setAttribute('height', '18');
    chevron.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 9l6 6 6-6');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    chevron.appendChild(path);

    btn.appendChild(label);
    btn.appendChild(chevron);

    var menu = document.createElement('div');
    menu.className = 'cselect-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    wrap.appendChild(btn);
    wrap.appendChild(menu);

    function currentText() {
      var opt = select.options[select.selectedIndex];
      return opt ? opt.textContent.trim() : '';
    }

    function syncLabel() {
      label.textContent = currentText();
      btn.disabled = select.disabled;
      wrap.classList.toggle('cselect-disabled', select.disabled);
    }

    function fillMenu() {
      menu.innerHTML = '';
      Array.prototype.forEach.call(select.options, function (opt, index) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'cselect-option';
        item.setAttribute('role', 'option');
        item.textContent = opt.textContent.trim();
        if (index === select.selectedIndex) {
          item.classList.add('active');
          item.setAttribute('aria-selected', 'true');
        }
        if (opt.disabled) item.disabled = true;
        item.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (index !== select.selectedIndex) {
            select.selectedIndex = index;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
          syncLabel();
          close();
        });
        menu.appendChild(item);
      });
    }

    function open() {
      if (select.disabled) return;
      closeOthers();
      fillMenu();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      wrap.classList.add(OPEN_CLASS);
      var active = menu.querySelector('.cselect-option.active');
      if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    }

    function close() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      wrap.classList.remove(OPEN_CLASS);
    }

    function toggle() {
      if (menu.hidden) open();
      else close();
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });

    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (menu.hidden) {
          open();
          return;
        }
        var step = e.key === 'ArrowDown' ? 1 : -1;
        var next = Math.min(select.options.length - 1, Math.max(0, select.selectedIndex + step));
        if (next !== select.selectedIndex) {
          select.selectedIndex = next;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          syncLabel();
          fillMenu();
        }
      }
    });

    // Keep the button label in sync when options are repopulated or translated
    var observer = new MutationObserver(function () {
      syncLabel();
      if (!menu.hidden) fillMenu();
    });
    observer.observe(select, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled'],
    });

    select.addEventListener('change', syncLabel);

    // Keep the label in sync when other code assigns select.value directly
    var valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (valueDesc && valueDesc.get && valueDesc.set) {
      Object.defineProperty(select, 'value', {
        configurable: true,
        get: function () { return valueDesc.get.call(select); },
        set: function (v) {
          valueDesc.set.call(select, v);
          syncLabel();
          if (!menu.hidden) fillMenu();
        },
      });
    }

    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    syncLabel();
  }

  function closeOthers() {
    document.querySelectorAll('.cselect-open').forEach(function (el) {
      el.classList.remove('cselect-open');
      var btn = el.querySelector('.cselect-btn');
      var menu = el.querySelector('.cselect-menu');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (menu) menu.hidden = true;
    });
  }

  function enhanceAll(root) {
    (root || document).querySelectorAll('select:not([data-native])').forEach(build);
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.cselect')) closeOthers();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeOthers();
  });

  enhanceAll(document);

  // Enhance selects rendered later (modals, dynamic forms)
  var domObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches('select')) build(node);
        if (node.querySelectorAll) enhanceAll(node);
      });
    });
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
})();
