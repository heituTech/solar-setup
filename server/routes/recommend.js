const express = require('express');
const pool = require('../db');
const router = express.Router();

// Depth of discharge by battery type
const DOD = {
  'lead-acid': 0.5,
  'lithium-ternary': 0.8,
  'lfp': 0.9,
};

/**
 * POST /api/recommend
 * Body: { load_power, daily_hours, autonomy_days, battery_type, system_voltage, peak_sun_hours }
 */
router.post('/', async (req, res) => {
  const {
    load_power,           // W
    daily_hours,          // hours/day
    autonomy_days = 1,    // days
    battery_type,         // optional
    system_voltage,       // optional '24V'/'48V'
    peak_sun_hours,       // optional, default from config
  } = req.body;

  if (!load_power || !daily_hours) {
    return res.status(400).json({ error: 'load_power and daily_hours are required' });
  }

  try {
    // Get default peak sun hours
    let psh = peak_sun_hours;
    if (!psh) {
      const [cfg] = await pool.query("SELECT config_value FROM system_config WHERE config_key='default_peak_sun_hours'");
      psh = cfg.length ? Number(cfg[0].config_value) : 5;
    }

    const loadW = Number(load_power);
    const hours = Number(daily_hours);
    const days = Number(autonomy_days);

    // ---- Sizing calculations ----
    const daily_energy_wh = loadW * hours; // Wh/day
    const inverter_efficiency = 0.92;

    // Battery: capacity needed (Wh) = daily * autonomy / (DoD * inverter_eff)
    // We don't know battery type yet, use a generic 0.7 then pick
    const generic_dod = 0.7;
    const battery_wh_needed = (daily_energy_wh * days) / (generic_dod * inverter_efficiency);
    const battery_kwh_needed = battery_wh_needed / 1000;

    // Inverter: rated power needed = load * 1.25
    const inverter_power_needed = loadW * 1.25;

    // Solar panel: power needed = daily_energy / (PSH * panel_eff * charge_eff)
    const panel_eff = 0.85;  // temperature + soiling
    const charge_eff = 0.95; // MPPT
    const solar_power_needed = daily_energy_wh / (psh * panel_eff * charge_eff);

    // ---- Fetch candidate products ----
    let invSql = 'SELECT * FROM inverters WHERE rated_power >= ?';
    const invParams = [inverter_power_needed];
    if (system_voltage) {
      invSql += ' AND battery_voltage = ?';
      invParams.push(system_voltage);
    }
    invSql += ' ORDER BY rated_power ASC LIMIT 1';
    const [invRows] = await pool.query(invSql, invParams);
    const inverter = invRows[0] || null;

    // Batteries - filter by type if specified, match voltage if possible
    let batSql = 'SELECT * FROM batteries';
    const batParams = [];
    const batConds = [];
    if (battery_type) {
      batConds.push('type = ?');
      batParams.push(battery_type);
    }
    if (inverter) {
      // match nominal voltage to inverter battery voltage (within tolerance)
      const targetV = parseFloat(inverter.battery_voltage);
      batConds.push('nominal_voltage = ?');
      batParams.push(targetV);
    }
    if (batConds.length) batSql += ' WHERE ' + batConds.join(' AND ');
    batSql += ' ORDER BY capacity_kwh ASC';
    const [batRows] = await pool.query(batSql, batParams);

    // If no matching battery, relax voltage constraint
    let battery_candidates = batRows;
    if (battery_candidates.length === 0 && inverter) {
      let relaxed = 'SELECT * FROM batteries';
      const rp = [];
      if (battery_type) {
        relaxed += ' WHERE type = ?';
        rp.push(battery_type);
      }
      relaxed += ' ORDER BY capacity_kwh ASC';
      const [rb] = await pool.query(relaxed, rp);
      battery_candidates = rb;
    }
    // If still none, try all
    if (battery_candidates.length === 0) {
      const [all] = await pool.query('SELECT * FROM batteries ORDER BY capacity_kwh ASC');
      battery_candidates = all;
    }

    // Pick smallest battery that meets requirement, then count how many
    let battery = null;
    let battery_count = 0;
    if (battery_candidates.length) {
      // Find the smallest battery that alone can cover, else use largest and count
      const single = battery_candidates.find((b) => b.capacity_kwh >= battery_kwh_needed);
      if (single) {
        battery = single;
        battery_count = 1;
      } else {
        battery = battery_candidates[battery_candidates.length - 1]; // largest
        battery_count = Math.ceil(battery_kwh_needed / battery.capacity_kwh);
      }
    }

    // Solar panels - pick smallest panel that is reasonable, count needed
    const [panelRows] = await pool.query('SELECT * FROM solar_panels ORDER BY rated_power ASC');
    let panel = null;
    let panel_count = 0;
    if (panelRows.length) {
      // Pick a mid-range panel (closest to 450W if available, else the median)
      panel = panelRows[Math.floor(panelRows.length / 2)];
      panel_count = Math.max(1, Math.ceil(solar_power_needed / panel.rated_power));
    }

    // ---- Pricing ----
    const items = [];
    let total_usd = 0;
    let total_khr = 0;

    if (inverter) {
      items.push({
        category: 'inverter',
        product: inverter,
        quantity: 1,
        subtotal_usd: Number(inverter.price_usd),
        subtotal_khr: Number(inverter.price_khr),
      });
      total_usd += Number(inverter.price_usd);
      total_khr += Number(inverter.price_khr);
    }
    if (battery) {
      const sub_usd = Number(battery.price_usd) * battery_count;
      const sub_khr = Number(battery.price_khr) * battery_count;
      items.push({
        category: 'battery',
        product: battery,
        quantity: battery_count,
        subtotal_usd: sub_usd,
        subtotal_khr: sub_khr,
      });
      total_usd += sub_usd;
      total_khr += sub_khr;
    }
    if (panel) {
      const sub_usd = Number(panel.price_usd) * panel_count;
      const sub_khr = Number(panel.price_khr) * panel_count;
      items.push({
        category: 'panel',
        product: panel,
        quantity: panel_count,
        subtotal_usd: sub_usd,
        subtotal_khr: sub_khr,
      });
      total_usd += sub_usd;
      total_khr += sub_khr;
    }

    res.json({
      input: { load_power: loadW, daily_hours: hours, autonomy_days: days, peak_sun_hours: psh, battery_type, system_voltage },
      calculation: {
        daily_energy_wh,
        battery_kwh_needed: Math.round(battery_kwh_needed * 100) / 100,
        inverter_power_needed: Math.round(inverter_power_needed),
        solar_power_needed: Math.round(solar_power_needed),
      },
      recommendation: { inverter, battery, panel },
      quantities: { inverter: inverter ? 1 : 0, battery: battery_count, panel: panel_count },
      items,
      total_usd: Math.round(total_usd * 100) / 100,
      total_khr: Math.round(total_khr),
      notes: ['note_install', 'note_battery_dod', 'note_panel_psh'],
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
