const pool = require('../db');
const core = require('../../public/js/pricing-core');

// Read system settings into the flat key/value shape the shared core expects.
async function loadConfig() {
  const [rows] = await pool.query('SELECT config_key, config_value FROM system_config');
  const cfg = {};
  rows.forEach((r) => { cfg[r.config_key] = r.config_value; });
  return core.normalizeConfig(cfg);
}

// The pricing core does all catalog filtering itself, so it receives every
// on-sale row for the three product tables.
async function loadProducts() {
  const [[inverters], [batteries], [panels]] = await Promise.all([
    pool.query("SELECT * FROM inverters WHERE sales_status = 'on_sale'"),
    pool.query("SELECT * FROM batteries WHERE sales_status = 'on_sale'"),
    pool.query("SELECT * FROM solar_panels WHERE sales_status = 'on_sale'"),
  ]);
  return { inverters, batteries, panels };
}

// A hybrid grid-tied quote without a battery can only use a battery-less start
// inverter. Discontinued models are not in the on-sale catalogue, so this flag
// lets the core keep telling the customer to confirm lead time with sales.
async function hasDiscontinuedBatteryLessHybrid() {
  const [rows] = await pool.query(
    "SELECT id FROM inverters WHERE sales_status = 'discontinued' AND type = 'hybrid' AND battery_less_start = 1 LIMIT 1"
  );
  return rows.length > 0;
}

// Member quotes must reference one of the member's own cases.
async function loadCase(input, user) {
  if (!input.case_id || !user || user.role !== 'member') return null;
  const [rows] = await pool.query('SELECT * FROM cases WHERE id = ? AND member_id = ?', [Number(input.case_id), user.id]);
  return rows.length ? rows[0] : null;
}

async function buildQuote(input, user) {
  const [config, products, caseInfo, discontinuedBatteryLess] = await Promise.all([
    loadConfig(),
    loadProducts(),
    loadCase(input, user),
    hasDiscontinuedBatteryLessHybrid(),
  ]);
  return core.buildQuote(input, {
    user,
    caseInfo,
    config,
    products,
    hasDiscontinuedBatteryLessHybrid: discontinuedBatteryLess,
  });
}

module.exports = { buildQuote, httpError: core.httpError };
