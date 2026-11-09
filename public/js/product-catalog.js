// Shared product catalog filter + pagination helpers for the staff and member
// pages. Pure browser code: filtering and slicing stay on the client.
(function (root) {
  var PAGE_SIZE = 8;
  var ALL_TECH = ['N type', 'P type', 'Topcon', 'HTJ', 'BC'];
  var FIELDS = {
    inverters: ['brand', 'keyword', 'type', 'voltage', 'powerMin', 'powerMax'],
    panels: ['brand', 'keyword', 'glass', 'tech', 'powerMin', 'powerMax'],
    batteries: ['brand', 'keyword', 'type', 'voltage', 'capacityMin', 'capacityMax'],
  };

  function defaultFilters(category) {
    var f = { status: 'all' };
    (FIELDS[category] || []).forEach(function (key) { f[key] = ''; });
    return f;
  }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uniqueBrands(products) {
    var seen = {};
    products.forEach(function (p) {
      if (p && p.brand) seen[p.brand] = true;
    });
    return Object.keys(seen).sort();
  }

  function within(value, min, max) {
    var n = Number(value);
    if (min !== '' && min !== undefined && min !== null && Number(min) !== 0 && n < Number(min)) return false;
    if (max !== '' && max !== undefined && max !== null && n > Number(max)) return false;
    return true;
  }

  function filter(category, products, f) {
    var kw = String(f.keyword || '').trim().toLowerCase();
    return (products || []).filter(function (p) {
      if (f.status && f.status !== 'all' && p.sales_status !== f.status) return false;
      if (f.brand && p.brand !== f.brand) return false;
      if (kw) {
        var text = (String(p.brand || '') + ' ' + String(p.model || '')).toLowerCase();
        if (text.indexOf(kw) === -1) return false;
      }
      if (category === 'inverters') {
        if (f.type && p.type !== f.type) return false;
        if (f.voltage && String(p.battery_voltage) !== f.voltage) return false;
        if (!within(p.rated_power, f.powerMin, f.powerMax)) return false;
      } else if (category === 'panels') {
        if (f.glass && p.glass_type !== f.glass) return false;
        if (f.tech) {
          var tech = Array.isArray(p.technology) ? p.technology : [];
          if (tech.indexOf(f.tech) === -1) return false;
        }
        if (!within(p.rated_power, f.powerMin, f.powerMax)) return false;
      } else {
        if (f.type && p.type !== f.type) return false;
        if (f.voltage) {
          var volts = Number(String(f.voltage).replace('V', ''));
          if (Number(p.nominal_voltage) !== volts) return false;
        }
        if (!within(p.capacity_kwh, f.capacityMin, f.capacityMax)) return false;
      }
      return true;
    });
  }

  function selectHtml(name, label, options, value, t) {
    return '<div class="filter-field"><label>' + esc(label) + '</label>' +
      '<select data-filter="' + name + '">' +
      options.map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('') +
      '</select></div>';
  }

  function rangeHtml(label, minKey, maxKey, filters, t) {
    return '<div class="filter-field filter-range-field"><label>' + esc(label) + '</label>' +
      '<div class="filter-range">' +
      '<input data-filter="' + minKey + '" type="number" min="0" step="any" value="' + esc(filters[minKey]) + '" placeholder="' + esc(t('min_value')) + '" />' +
      '<input data-filter="' + maxKey + '" type="number" min="0" step="any" value="' + esc(filters[maxKey]) + '" placeholder="' + esc(t('max_value')) + '" />' +
      '</div></div>';
  }

  function barHtml(category, products, filters, t, opts) {
    var brands = uniqueBrands(products || []);
    var all = { value: '', label: t('filter_all') };
    var html = '';

    html += selectHtml('brand', t('brand'), [all].concat(brands.map(function (b) { return { value: b, label: b }; })), filters.brand, t);
    html += '<div class="filter-field"><label>' + esc(t('search')) + '</label>' +
      '<input data-filter="keyword" type="text" value="' + esc(filters.keyword) + '" placeholder="' + esc(t('search_products')) + '" /></div>';

    if (category === 'inverters') {
      html += selectHtml('type', t('type'), [all,
        { value: 'hybrid', label: t('hybrid') },
        { value: 'off-grid', label: t('off_grid') }], filters.type, t);
      html += selectHtml('voltage', t('voltage'), [all,
        { value: '12V', label: '12V' }, { value: '24V', label: '24V' }, { value: '48V', label: '48V' }], filters.voltage, t);
      html += rangeHtml(t('power') + ' (W)', 'powerMin', 'powerMax', filters, t);
    } else if (category === 'panels') {
      html += selectHtml('glass', t('glass_type'), [all,
        { value: 'single', label: t('single_glass') },
        { value: 'double', label: t('double_glass') }], filters.glass, t);
      html += selectHtml('tech', t('technology'), [all].concat(ALL_TECH.map(function (x) { return { value: x, label: x }; })), filters.tech, t);
      html += rangeHtml(t('power') + ' (W)', 'powerMin', 'powerMax', filters, t);
    } else {
      html += selectHtml('type', t('type'), [all,
        { value: 'lfp', label: t('battery_lfp') },
        { value: 'lithium-ternary', label: t('battery_ternary') },
        { value: 'lead-acid', label: t('battery_lead_acid') }], filters.type, t);
      html += selectHtml('voltage', t('voltage'), [all,
        { value: '12V', label: '12V' }, { value: '24V', label: '24V' }, { value: '48V', label: '48V' }], filters.voltage, t);
      html += rangeHtml(t('capacity') + ' (kWh)', 'capacityMin', 'capacityMax', filters, t);
    }

    if (opts && opts.status) {
      html += selectHtml('status', t('sales_status'), [
        { value: 'all', label: t('filter_all') },
        { value: 'on_sale', label: t('on_sale') },
        { value: 'discontinued', label: t('discontinued') },
      ], filters.status || 'all', t);
    }

    if (!(opts && opts.hideSearch)) {
      html += '<div class="filter-field filter-actions">' +
        '<button type="button" class="btn btn-secondary btn-sm" data-filter-action="reset">' + esc(t('reset_filters')) + '</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-filter-action="search">' + esc(t('search')) + '</button>' +
        '</div>';
    }

    return html;
  }

  // Filters apply only when the Search button is clicked (or Enter is pressed
  // in the keyword box); changing a control never triggers a re-render by itself.
  function bind(root, filters, onSearch, onReset) {
    function apply() {
      Array.prototype.forEach.call(root.querySelectorAll('[data-filter]'), function (el) {
        filters[el.dataset.filter] = el.value;
      });
      onSearch();
    }

    var button = root.querySelector('[data-filter-action="search"]');
    if (button) button.addEventListener('click', apply);

    var reset = root.querySelector('[data-filter-action="reset"]');
    if (reset) reset.addEventListener('click', function () { if (onReset) onReset(); });

    var keyword = root.querySelector('[data-filter="keyword"]');
    if (keyword) {
      keyword.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          apply();
        }
      });
    }
  }

  // Simple client-side pager: one page of results at a time.
  function pagerHtml(page, pageCount, t) {
    if (pageCount <= 1) return '';
    return '<div class="pager">' +
      '<button type="button" class="btn btn-secondary btn-sm" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>' + esc(t('prev_page')) + '</button>' +
      '<span class="pager-info">' + page + ' / ' + pageCount + '</span>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-page="' + (page + 1) + '"' + (page >= pageCount ? ' disabled' : '') + '>' + esc(t('next_page')) + '</button>' +
      '</div>';
  }

  function bindPager(root, onPage) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-page]'), function (btn) {
      btn.addEventListener('click', function () { onPage(Number(btn.dataset.page)); });
    });
  }

  root.ProductCatalog = {
    PAGE_SIZE: PAGE_SIZE,
    defaultFilters: defaultFilters,
    filter: filter,
    barHtml: barHtml,
    bind: bind,
    pagerHtml: pagerHtml,
    bindPager: bindPager,
    esc: esc,
  };
})(window);
