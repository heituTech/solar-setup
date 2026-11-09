const pool = require('../db');

const DOD = { 'lead-acid': 0.5, 'lithium-ternary': 0.8, lfp: 0.9 };
const INVERTER_EFF = 0.92;
const PANEL_EFF = 0.85;
const CHARGE_EFF = 0.95;
const GENERATION_EFF = 0.8;
const MAX_BATTERY_QTY = 50;
const MAX_PANEL_QTY = 200;
const MAX_COMBOS = 10000;
// Virtual zero-cost battery used when a hybrid grid-tied system needs no battery.
const NO_BATTERY = {
  id: null,
  brand: null,
  model: null,
  capacity_kwh: 0,
  nominal_voltage: null,
  type: null,
  discharge_rate: 0,
  parallel_supported: 1,
  bms_brand: null,
  warranty_months: 0,
  price_usd: 0,
  price_khr: 0,
  sales_status: 'on_sale',
  _no_battery: true,
};

function httpError(message, status = 400, params) {
  const err = new Error(message);
  err.status = status;
  if (params) err.params = params;
  return err;
}

// Inverter parallel capability: hybrid cases use grid-side parallel ("并联"),
// off-grid cases use off-grid parallel ("并机"); guests use the better of both.
function inverterMaxUnits(inv, systemMode) {
  const g = Math.max(1, Number(inv.grid_parallel_max) || 1);
  const o = Math.max(1, Number(inv.offgrid_parallel_max) || 1);
  if (systemMode === 'hybrid') return g;
  if (systemMode === 'off-grid') return o;
  return Math.max(g, o);
}

function inverterUnitsNeeded(inv, needW, gridTie = false) {
  if (gridTie) {
    const gridMax = Number(inv.grid_output_max_w) > 0 ? Number(inv.grid_output_max_w) : 0;
    // No documented grid-tied output limit = unlimited pass-through, so one unit is enough.
    if (!gridMax) return 1;
    return Math.max(1, Math.ceil(needW / gridMax));
  }
  return Math.max(1, Math.ceil(needW / Number(inv.rated_power)));
}

function batteryQtyNeeded(bat, ctx) {
  if (bat._no_battery) return 0;
  const batteryKwhNeeded = ctx.nightKwhNeeded / ((DOD[bat.type] || 0.7) * INVERTER_EFF);
  let qty = Math.max(1, Math.ceil(batteryKwhNeeded / Number(bat.capacity_kwh)));
  // Night load drives battery discharge. For a day-only off-grid system the single
  // battery output must cover 1.2x the day peak power.
  const requiredDischargeW = ctx.nightPeakW > 0 ? ctx.nightPeakW : Number(ctx.dayPeakW || 0) * 1.2;
  const unitDischargeW = Number(bat.capacity_kwh) * Number(bat.discharge_rate) * 1000;
  while (unitDischargeW > 0 && qty * unitDischargeW < requiredDischargeW && qty <= MAX_BATTERY_QTY) {
    qty += 1;
  }
  // Multiple units may only be the same product and require parallel support.
  if (qty > 1 && !Number(bat.parallel_supported)) return Infinity;
  return qty;
}

function panelQtyNeeded(panel, solarNeedW) {
  return Math.max(1, Math.ceil(solarNeedW / Number(panel.rated_power)));
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function roundKhr(n) {
  return Math.round(Number(n));
}

async function loadConfig() {
  const [rows] = await pool.query('SELECT config_key, config_value FROM system_config');
  const cfg = {};
  rows.forEach((r) => { cfg[r.config_key] = r.config_value; });
  return {
    usdToKhr: Number(cfg.usd_to_khr) || 4100,
    defaultPsh: Number(cfg.default_peak_sun_hours) || 4.5,
    installPercent: Number(cfg.installation_fee_percent) || 20,
    installGroundPercent: Number(cfg.installation_fee_ground_percent) || 15,
    installRooftopPercent: Number(cfg.installation_fee_rooftop_percent) || 20,
    installMinUsd: Number(cfg.installation_fee_min_usd) || 500,
    batteryPricePerKwh: {
      lfp: Number(cfg.battery_price_lfp_per_kwh) || 120,
      'lithium-ternary': Number(cfg.battery_price_ternary_per_kwh) || 120,
      'lead-acid': Number(cfg.battery_price_lead_acid_per_kwh) || 85,
    },
  };
}

function priceOf(product, rate) {
  const usd = Number(product.price_usd) || 0;
  const khr = Number(product.price_khr) > 0 ? Number(product.price_khr) : roundKhr(usd * rate);
  return { usd, khr };
}

// Guests are quoted battery cost by chemistry unit price (USD/kWh) maintained in
// system settings; members always pay the real catalog product price.
function batteryPriceOf(bat, ctx) {
  const perKwh = Number(ctx.batteryPricePerKwh[bat.type]) || 0;
  const usd = perKwh > 0 ? Number(bat.capacity_kwh) * perKwh : Number(bat.price_usd) || 0;
  return { usd, khr: roundKhr(usd * ctx.rate) };
}

function exportProduct(category, p, rate) {
  const price = priceOf(p, rate);
  const base = {
    id: p.id,
    brand: p.brand,
    model: p.model || null,
    price_usd: round2(price.usd),
    price_khr: roundKhr(price.khr),
  };
  if (category === 'inverters') {
    Object.assign(base, {
      rated_power: Number(p.rated_power),
      type: p.type,
      battery_voltage: p.battery_voltage,
      mppt_channels: Number(p.mppt_channels),
      mppt_max_current_a: p.mppt_max_current_a === null || p.mppt_max_current_a === undefined ? null : Number(p.mppt_max_current_a),
      mppt_max_voltage_v: p.mppt_max_voltage_v === null || p.mppt_max_voltage_v === undefined ? null : Number(p.mppt_max_voltage_v),
      grid_parallel_max: Math.max(1, Number(p.grid_parallel_max) || 1),
      offgrid_parallel_max: Math.max(1, Number(p.offgrid_parallel_max) || 1),
      grid_output_max_w: p.grid_output_max_w === null || p.grid_output_max_w === undefined ? null : Number(p.grid_output_max_w),
      battery_less_start: Number(p.battery_less_start) ? 1 : 0,
      warranty_months: Number(p.warranty_months),
    });
  } else if (category === 'panels') {
    Object.assign(base, {
      rated_power: Number(p.rated_power),
      length_mm: p.length_mm === null ? null : Number(p.length_mm),
      width_mm: p.width_mm === null ? null : Number(p.width_mm),
      height_mm: p.height_mm === null ? null : Number(p.height_mm),
      voltage_min: p.voltage_min === null ? null : Number(p.voltage_min),
      voltage_max: p.voltage_max === null ? null : Number(p.voltage_max),
      voc_v: p.voc_v === null || p.voc_v === undefined ? null : Number(p.voc_v),
      isc_a: p.isc_a === null || p.isc_a === undefined ? null : Number(p.isc_a),
      glass_type: p.glass_type,
      technology: Array.isArray(p.technology) ? p.technology : [],
      warranty_months: Number(p.warranty_months),
    });
  } else {
    Object.assign(base, {
      capacity_kwh: Number(p.capacity_kwh),
      nominal_voltage: Number(p.nominal_voltage),
      type: p.type,
      discharge_rate: Number(p.discharge_rate),
      parallel_supported: Number(p.parallel_supported) ? 1 : 0,
      bms_brand: p.bms_brand || null,
      warranty_months: Number(p.warranty_months),
    });
  }
  return base;
}

function buildCombo(inv, bat, panel, ctx) {
  const inverterQty = inverterUnitsNeeded(inv, ctx.inverterNeedW, ctx.gridTieSizing);
  const batteryQty = batteryQtyNeeded(bat, ctx);
  const panelQty = ctx.panelQtyOverride || panelQtyNeeded(panel, ctx.solarNeedW);

  const invPrice = priceOf(inv, ctx.rate);
  const batPrice = ctx.guestBatteryPricing ? batteryPriceOf(bat, ctx) : priceOf(bat, ctx.rate);
  const panelPrice = priceOf(panel, ctx.rate);

  const hardwareUsd = invPrice.usd * inverterQty + batPrice.usd * batteryQty + panelPrice.usd * panelQty;
  const hardwareKhr = invPrice.khr * inverterQty + batPrice.khr * batteryQty + panelPrice.khr * panelQty;
  const installUsd = ctx.includeInstallation
    ? Math.max(ctx.installMinUsd, hardwareUsd * ctx.installPercent / 100)
    : 0;
  const installKhr = ctx.includeInstallation ? roundKhr(installUsd * ctx.rate) : 0;
  const totalUsd = hardwareUsd + installUsd;
  const totalKhr = hardwareKhr + installKhr;

  return {
    inverter: inv,
    battery: bat,
    panel,
    quantities: { inverter: inverterQty, battery: batteryQty, panel: panelQty },
    hardware_usd: round2(hardwareUsd),
    hardware_khr: roundKhr(hardwareKhr),
    installation_usd: round2(installUsd),
    installation_khr: roundKhr(installKhr),
    total_usd: round2(totalUsd),
    total_khr: roundKhr(totalKhr),
    panel_kwp: (Number(panel.rated_power) * panelQty) / 1000,
    battery_kwh: Number(bat.capacity_kwh) * batteryQty,
  };
}

function comboSummary(combo, rate) {
  const items = [
    { category: 'inverter', product: exportProduct('inverters', combo.inverter, rate), quantity: combo.quantities.inverter, subtotal_usd: round2(Number(combo.inverter.price_usd) * combo.quantities.inverter), subtotal_khr: priceOf(combo.inverter, rate).khr * combo.quantities.inverter },
    { category: 'battery', product: exportProduct('batteries', combo.battery, rate), quantity: combo.quantities.battery, subtotal_usd: round2(Number(combo.battery.price_usd) * combo.quantities.battery), subtotal_khr: priceOf(combo.battery, rate).khr * combo.quantities.battery },
    { category: 'panel', product: exportProduct('panels', combo.panel, rate), quantity: combo.quantities.panel, subtotal_usd: round2(Number(combo.panel.price_usd) * combo.quantities.panel), subtotal_khr: priceOf(combo.panel, rate).khr * combo.quantities.panel },
  ].filter((item) => item.quantity > 0);
  return {
    items,
    quantities: combo.quantities,
    hardware_usd: combo.hardware_usd,
    hardware_khr: combo.hardware_khr,
    installation_usd: combo.installation_usd,
    installation_khr: combo.installation_khr,
    total_usd: combo.total_usd,
    total_khr: combo.total_khr,
    panel_kwp: round2(combo.panel_kwp),
    battery_kwh: round2(combo.battery_kwh),
  };
}

function paybackForCombo(combo, ctx) {
  const priceUsdPerKwh = ctx.electricityPriceUsdPerKwh;
  if (!priceUsdPerKwh || priceUsdPerKwh <= 0) return null;
  const consumptionSavings = ctx.dailyKwh * 365 * priceUsdPerKwh;
  const generationSavings = combo.panel_kwp * ctx.psh * 365 * GENERATION_EFF * priceUsdPerKwh;
  const consumptionYears = consumptionSavings > 0 ? combo.total_usd / consumptionSavings : null;
  const generationYears = generationSavings > 0 ? combo.total_usd / generationSavings : null;
  return { consumptionSavings, generationSavings, consumptionYears, generationYears };
}

async function buildQuote(body, user) {
  const cfg = await loadConfig();

  // ---- Inputs: day/night model, with legacy load_power/daily_hours fallback ----
  const dayPeakW = body.day_peak_power !== undefined && body.day_peak_power !== ''
    ? Number(body.day_peak_power) : Number(body.load_power);
  const dayHours = body.day_hours !== undefined && body.day_hours !== ''
    ? Number(body.day_hours) : Number(body.daily_hours);
  const nightPeakW = Number(body.night_peak_power) || 0;
  const nightHours = Number(body.night_hours) || 0;
  const days = body.autonomy_days === undefined || body.autonomy_days === '' ? 1 : Number(body.autonomy_days);
  const batteryType = body.battery_type || null;
  const systemVoltage = body.system_voltage || null;
  const strategy = [1, 2, 3].includes(Number(body.strategy)) ? Number(body.strategy) : 2;

  // Peak sun hours: explicit override wins, otherwise strategy mapping
  let psh;
  if (body.peak_sun_hours !== undefined && body.peak_sun_hours !== '') {
    psh = Number(body.peak_sun_hours);
  } else {
    psh = strategy === 1 ? 6 : strategy === 3 ? 3 : cfg.defaultPsh;
  }

  if (!Number.isFinite(dayPeakW) || dayPeakW <= 0) throw httpError('invalid_day_peak_power');
  if (!Number.isFinite(dayHours) || dayHours < 0 || dayHours > 8) throw httpError('invalid_day_hours');
  if (nightPeakW < 0) throw httpError('invalid_night_peak_power');
  if (nightHours < 0 || nightHours > 16) throw httpError('invalid_night_hours');
  if (dayHours <= 0 && nightHours <= 0) throw httpError('invalid_daily_hours');
  if (nightHours > 0 && nightPeakW <= 0) throw httpError('invalid_night_peak_power');
  if (!Number.isFinite(days) || days <= 0 || days > 30) throw httpError('invalid_autonomy_days');
  if (!Number.isFinite(psh) || psh <= 0 || psh > 12) throw httpError('invalid_peak_sun_hours');
  if (batteryType && !DOD[batteryType]) throw httpError('invalid_battery_type');
  if (systemVoltage && !['12V', '24V', '48V'].includes(systemVoltage)) throw httpError('invalid_system_voltage');

  // ---- Member case: required for members, drives installation fee, mode and PBP ----
  const isMember = Boolean(user && user.role === 'member');
  let caseInfo = null;
  if (isMember && !body.case_id) throw httpError('case_required', 400);
  if (body.case_id) {
    if (!isMember) throw httpError('forbidden', 403);
    const [rows] = await pool.query('SELECT * FROM cases WHERE id = ? AND member_id = ?', [Number(body.case_id), user.id]);
    if (!rows.length) throw httpError('case_not_found', 404);
    caseInfo = rows[0];
  }
  const installPercent = caseInfo
    ? (caseInfo.install_type === 'ground' ? cfg.installGroundPercent : cfg.installRooftopPercent)
    : cfg.installPercent;

  // ---- Sizing ----
  const dayKwh = (dayPeakW * dayHours) / 1000;
  const nightKwh = (nightPeakW * nightHours) / 1000;
  const dailyKwh = dayKwh + nightKwh;
  const maxPeakW = Math.max(dayPeakW, nightPeakW);
  // Grid availability drives the system type: no grid = pure off-grid (battery mandatory).
  // Guests send has_grid; members inherit it from the case.
  const hasGrid = caseInfo
    ? Boolean(caseInfo.has_grid)
    : (body.has_grid === undefined || body.has_grid === null || body.has_grid === '') ? null : Boolean(body.has_grid);
  // Members inherit the mode saved on the case; guests must pick one explicitly
  // so we only quote a battery when the customer chose pure off-grid.
  let systemMode = caseInfo ? caseInfo.system_mode : (body.system_mode || null);
  if (hasGrid === false) systemMode = 'off-grid';
  if (!systemMode) throw httpError('system_mode_required');
  if (!['off-grid', 'hybrid'].includes(systemMode)) throw httpError('invalid_system_mode');

  // Backup critical load (hybrid only): powered from the inverter backup (EPS) port,
  // so the inverter bank must cover it. Grid-side loads are carried with utility power
  // and do not limit inverter sizing. Falls back to all loads when not provided.
  let backupPeakW = null;
  if (systemMode === 'hybrid' && body.backup_peak_power !== undefined && body.backup_peak_power !== '') {
    backupPeakW = Number(body.backup_peak_power);
    if (!Number.isFinite(backupPeakW) || backupPeakW <= 0) throw httpError('invalid_backup_peak_power');
  }
  const inverterBaseW = systemMode === 'hybrid' && backupPeakW !== null ? backupPeakW : maxPeakW;
  const inverterNeedW = inverterBaseW * 1.25;
  // Hybrid grid-side loads can be passed through from the grid; use the inverter's
  // grid-tied max output when maintained, otherwise one unit means unlimited pass-through.
  const gridTieSizing = systemMode === 'hybrid' && backupPeakW === null;
  const solarNeedW = (dailyKwh * 1000) / (psh * PANEL_EFF * CHARGE_EFF);
  // Battery capacity only covers the night load; a day-only load needs no battery capacity.
  const nightKwhNeeded = nightKwh * days;
  const genericBatteryKwh = nightKwhNeeded / (0.7 * INVERTER_EFF);

  const selected = {
    inverter: body.inverter_id ? Number(body.inverter_id) : null,
    battery: body.battery_id ? Number(body.battery_id) : null,
    panel: body.panel_id ? Number(body.panel_id) : null,
  };

  let [inverters] = await pool.query("SELECT * FROM inverters WHERE sales_status = 'on_sale' ORDER BY rated_power ASC");
  let [batteries] = await pool.query("SELECT * FROM batteries WHERE sales_status = 'on_sale' ORDER BY capacity_kwh ASC");
  const [panelsAll] = await pool.query("SELECT * FROM solar_panels WHERE sales_status = 'on_sale' ORDER BY rated_power ASC");
  let panels = panelsAll;

  if (systemVoltage) inverters = inverters.filter((p) => String(p.battery_voltage) === systemVoltage);
  // Hybrid cases need hybrid inverters; off-grid cases may also use hybrid inverters (they work off-grid)
  if (systemMode === 'hybrid') inverters = inverters.filter((p) => p.type === 'hybrid');
  if (systemMode === 'off-grid') inverters = inverters.filter((p) => p.type === 'off-grid' || p.type === 'hybrid');
  if (batteryType) batteries = batteries.filter((p) => p.type === batteryType);
  if (batteryType && batteries.length === 0) {
    const [all] = await pool.query("SELECT * FROM batteries WHERE sales_status = 'on_sale' ORDER BY capacity_kwh ASC");
    batteries = all;
  }
  if (systemVoltage) {
    batteries = batteries.filter((p) => Number(p.nominal_voltage) === Number(parseFloat(systemVoltage)));
  }

  if (selected.inverter) {
    const [rows] = await pool.query("SELECT * FROM inverters WHERE id = ? AND sales_status = 'on_sale'", [selected.inverter]);
    if (!rows.length) throw httpError('selected_inverter_unavailable');
    if (inverterUnitsNeeded(rows[0], inverterNeedW, gridTieSizing) > inverterMaxUnits(rows[0], systemMode)) {
      throw httpError('selected_inverter_insufficient', 400, { need_kw: round2(inverterNeedW / 1000) });
    }
    if (systemVoltage && String(rows[0].battery_voltage) !== systemVoltage) throw httpError('selected_inverter_voltage_mismatch');
    if (systemMode === 'hybrid' && rows[0].type !== 'hybrid') throw httpError('selected_inverter_mode_mismatch');
    inverters = rows;
  }
  if (selected.battery) {
    const [rows] = await pool.query("SELECT * FROM batteries WHERE id = ? AND sales_status = 'on_sale'", [selected.battery]);
    if (!rows.length) throw httpError('selected_battery_unavailable');
    if (batteryType && rows[0].type !== batteryType) throw httpError('selected_battery_type_mismatch');
    if (systemVoltage && Number(rows[0].nominal_voltage) !== Number(parseFloat(systemVoltage))) throw httpError('selected_battery_voltage_mismatch');
    batteries = rows;
  }
  if (selected.panel) {
    const [rows] = await pool.query("SELECT * FROM solar_panels WHERE id = ? AND sales_status = 'on_sale'", [selected.panel]);
    if (!rows.length) throw httpError('selected_panel_unavailable');
    panels = rows;
  }

  // Members may override the recommended panel count; every downstream result
  // (hardware cost, installation, array kWp and payback) follows this quantity.
  let panelQtyOverride = null;
  if (body.panel_qty !== undefined && body.panel_qty !== null && body.panel_qty !== '') {
    if (!selected.panel) throw httpError('invalid_panel_qty');
    const qty = Number(body.panel_qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_PANEL_QTY) throw httpError('invalid_panel_qty');
    panelQtyOverride = qty;
  }

  // ---- Category-specific feasibility: tell the customer exactly what cannot fit ----
  // Off-grid always needs a battery; hybrid grid-tied only needs one with night load
  // (or when the customer explicitly picked a battery).
  const needsBattery = systemMode === 'off-grid' || nightKwh > 0 || Boolean(selected.battery);
  if (!inverters.length) throw httpError('no_inverter_fit', 400, { need_kw: round2(inverterNeedW / 1000) });
  if (needsBattery && !batteries.length) throw httpError('no_battery_fit', 400, { need_kwh: round2(genericBatteryKwh), max_qty: MAX_BATTERY_QTY });
  if (!panels.length) throw httpError('no_panel_fit', 400, { need_kw: round2(solarNeedW / 1000), max_qty: MAX_PANEL_QTY });

  const preCtx = { nightKwhNeeded, dayPeakW, nightPeakW, maxPeakW };
  // A hybrid system without a battery may only use a grid-tied inverter that can start
  // and run without one. If such a model is only discontinued, tell the customer to
  // confirm lead time with sales instead of silently quoting unavailable stock.
  if (!needsBattery) {
    inverters = inverters.filter((p) => p.type === 'hybrid' && Number(p.battery_less_start));
    if (!inverters.length) {
      const [legacy] = await pool.query(
        "SELECT id FROM inverters WHERE sales_status = 'discontinued' AND type = 'hybrid' AND battery_less_start = 1 LIMIT 1"
      );
      if (legacy.length) throw httpError('battery_less_inverter_out_of_stock', 400);
      throw httpError('no_battery_less_inverter', 400);
    }
    if (selected.inverter && !inverters.some((p) => p.id === selected.inverter)) {
      throw httpError('selected_inverter_no_battery_start');
    }
  }
  inverters = inverters.filter((p) => inverterUnitsNeeded(p, inverterNeedW, gridTieSizing) <= inverterMaxUnits(p, systemMode));
  if (!inverters.length) throw httpError('no_inverter_fit', 400, { need_kw: round2(inverterNeedW / 1000) });
  if (needsBattery) {
    batteries = batteries.filter((p) => batteryQtyNeeded(p, preCtx) <= MAX_BATTERY_QTY);
    if (!batteries.length && selected.battery) throw httpError('selected_battery_unavailable');
    if (!batteries.length) throw httpError('no_battery_fit', 400, { need_kwh: round2(genericBatteryKwh), max_qty: MAX_BATTERY_QTY });
    // Prefer a single battery: if any product covers the whole requirement alone, only quote those.
    if (!selected.battery) {
      const singleUnit = batteries.filter((p) => batteryQtyNeeded(p, preCtx) === 1);
      if (singleUnit.length) batteries = singleUnit;
    }
  } else {
    batteries = [];
  }
  const quoteBatteries = needsBattery ? batteries : [NO_BATTERY];
  panels = panels.filter((p) => panelQtyNeeded(p, solarNeedW) <= MAX_PANEL_QTY);
  if (!panels.length) throw httpError('no_panel_fit', 400, { need_kw: round2(solarNeedW / 1000), max_qty: MAX_PANEL_QTY });

  const isMemberUser = isMember;
  const electricityPrice = caseInfo && caseInfo.electricity_price !== null && caseInfo.electricity_price !== undefined
    ? Number(caseInfo.electricity_price) : null;
  const electricityCurrency = caseInfo ? (caseInfo.electricity_price_currency || 'USD') : 'USD';
  let electricityPriceUsdPerKwh = null;
  if (electricityPrice && electricityPrice > 0) {
    electricityPriceUsdPerKwh = electricityCurrency === 'KHR' ? electricityPrice / cfg.usdToKhr : electricityPrice;
  }

  const includeInstallation = body.include_installation !== false;
  const ctx = {
    dailyKwh,
    days,
    psh,
    solarNeedW,
    nightKwhNeeded,
    dayPeakW,
    nightPeakW,
    maxPeakW,
    inverterNeedW,
    gridTieSizing,
    rate: cfg.usdToKhr,
    includeInstallation,
    installPercent,
    installMinUsd: cfg.installMinUsd,
    electricityPriceUsdPerKwh,
    guestBatteryPricing: !isMember,
    batteryPricePerKwh: cfg.batteryPricePerKwh,
    panelQtyOverride,
  };

  let comboCount = 0;
  let truncated = false;
  let minCombo = null;
  let maxCombo = null;
  let minHardware = null;
  let maxHardware = null;
  let minInstall = null;
  let maxInstall = null;
  let pbpConsumptionMin = null;
  let pbpConsumptionMax = null;
  let pbpGenerationMin = null;
  let pbpGenerationMax = null;

  for (const inv of inverters) {
    for (const bat of quoteBatteries) {
      if (!bat._no_battery && Number(bat.nominal_voltage) !== Number(parseFloat(inv.battery_voltage))) continue;
      for (const panel of panels) {
        const combo = buildCombo(inv, bat, panel, ctx);
        comboCount += 1;
        if (!minCombo || combo.total_usd < minCombo.total_usd) minCombo = combo;
        if (!maxCombo || combo.total_usd > maxCombo.total_usd) maxCombo = combo;
        if (minHardware === null || combo.hardware_usd < minHardware) minHardware = combo.hardware_usd;
        if (maxHardware === null || combo.hardware_usd > maxHardware) maxHardware = combo.hardware_usd;
        if (minInstall === null || combo.installation_usd < minInstall) minInstall = combo.installation_usd;
        if (maxInstall === null || combo.installation_usd > maxInstall) maxInstall = combo.installation_usd;

        const pbp = paybackForCombo(combo, ctx);
        if (pbp) {
          if (pbp.consumptionYears !== null) {
            pbpConsumptionMin = pbpConsumptionMin === null ? pbp.consumptionYears : Math.min(pbpConsumptionMin, pbp.consumptionYears);
            pbpConsumptionMax = pbpConsumptionMax === null ? pbp.consumptionYears : Math.max(pbpConsumptionMax, pbp.consumptionYears);
          }
          if (pbp.generationYears !== null) {
            pbpGenerationMin = pbpGenerationMin === null ? pbp.generationYears : Math.min(pbpGenerationMin, pbp.generationYears);
            pbpGenerationMax = pbpGenerationMax === null ? pbp.generationYears : Math.max(pbpGenerationMax, pbp.generationYears);
          }
        }
        if (comboCount >= MAX_COMBOS) { truncated = true; break; }
      }
      if (truncated) break;
    }
    if (truncated) break;
  }

  if (!minCombo) throw httpError('no_voltage_match');
  const isExact = Boolean(selected.inverter && selected.panel && (selected.battery || !needsBattery));

  const result = {
    mode: isMember ? 'member' : 'guest',
    input: {
      day_peak_power: dayPeakW,
      day_hours: dayHours,
      night_peak_power: nightPeakW,
      night_hours: nightHours,
      backup_peak_power: backupPeakW,
      autonomy_days: days,
      strategy,
      peak_sun_hours: psh,
      battery_type: batteryType,
      system_voltage: systemVoltage,
      system_mode: systemMode,
      has_grid: hasGrid,
      case_id: caseInfo ? caseInfo.id : null,
    },
    calculation: {
      daily_energy_kwh: round2(dailyKwh),
      day_energy_kwh: round2(dayKwh),
      night_energy_kwh: round2(nightKwh),
      battery_required: needsBattery,
      battery_min_units: needsBattery ? 1 : 0,
      battery_kwh_needed: round2(genericBatteryKwh),
      inverter_power_needed: round2(inverterNeedW),
      solar_power_needed: round2(solarNeedW),
      peak_sun_hours: psh,
    },
    case: caseInfo ? {
      id: caseInfo.id,
      name: caseInfo.name,
      address: caseInfo.address,
      has_grid: Boolean(caseInfo.has_grid),
      install_type: caseInfo.install_type,
      system_mode: caseInfo.system_mode,
      electricity_price: caseInfo.electricity_price === null ? null : Number(caseInfo.electricity_price),
      electricity_price_currency: caseInfo.electricity_price_currency || 'USD',
    } : null,
    combo_count: comboCount,
    truncated,
    is_exact: isExact,
    requires_registration: !isMember,
    selected,
    price_range: {
      min_usd: minCombo.total_usd,
      max_usd: maxCombo.total_usd,
      min_khr: minCombo.total_khr,
      max_khr: maxCombo.total_khr,
    },
    hardware_range: {
      min_usd: round2(minHardware),
      max_usd: round2(maxHardware),
      min_khr: roundKhr(minHardware * cfg.usdToKhr),
      max_khr: roundKhr(maxHardware * cfg.usdToKhr),
    },
    installation_range: {
      min_usd: round2(minInstall),
      max_usd: round2(maxInstall),
      min_khr: roundKhr(minInstall * cfg.usdToKhr),
      max_khr: roundKhr(maxInstall * cfg.usdToKhr),
      percent: installPercent,
      min_fee_usd: cfg.installMinUsd,
    },
    notes: ['note_install']
      .concat(needsBattery ? ['note_battery_dod'] : [])
      .concat(['note_panel_psh'])
      .concat(systemMode === 'hybrid' ? ['note_hybrid_backup'] : [])
      .concat(needsBattery ? [] : ['note_hybrid_no_battery']),
  };

  if (isMember) {
    result.candidates = {
      inverters: inverters.map((p) => {
        const exp = exportProduct('inverters', p, cfg.usdToKhr);
        exp.required_qty = inverterUnitsNeeded(p, inverterNeedW, gridTieSizing);
        return exp;
      }),
      batteries: batteries.map((p) => exportProduct('batteries', p, cfg.usdToKhr)),
      panels: panels.map((p) => {
        const exp = exportProduct('panels', p, cfg.usdToKhr);
        const qty = panelQtyOverride || Math.max(1, Math.min(MAX_PANEL_QTY, Math.ceil(solarNeedW / Number(p.rated_power))));
        exp.required_qty = qty;
        exp.total_kwp = round2((Number(p.rated_power) * qty) / 1000);
        return exp;
      }),
    };
  }
  if (isExact) result.exact = comboSummary(minCombo, cfg.usdToKhr);

  if (electricityPriceUsdPerKwh) {
    const pbpBase = {
      electricity_price_usd_per_kwh: round2(electricityPriceUsdPerKwh),
      electricity_price_input: electricityPrice,
      electricity_price_currency: electricityCurrency,
    };
    if (isExact) {
      const pbp = paybackForCombo(minCombo, ctx);
      result.pbp = {
        ...pbpBase,
        consumption: {
          annual_savings_usd: round2(pbp.consumptionSavings),
          annual_savings_khr: roundKhr(pbp.consumptionSavings * cfg.usdToKhr),
          payback_years: round2(pbp.consumptionYears),
        },
        generation: {
          annual_savings_usd: round2(pbp.generationSavings),
          annual_savings_khr: roundKhr(pbp.generationSavings * cfg.usdToKhr),
          payback_years: round2(pbp.generationYears),
        },
      };
    } else {
      result.pbp_range = {
        ...pbpBase,
        consumption: { min_years: round2(pbpConsumptionMin), max_years: round2(pbpConsumptionMax) },
        generation: { min_years: round2(pbpGenerationMin), max_years: round2(pbpGenerationMax) },
      };
    }
  } else if (isMember) {
    result.pbp_unavailable_reason = 'electricity_price_not_set';
  }

  return result;
}

module.exports = { buildQuote, httpError };
