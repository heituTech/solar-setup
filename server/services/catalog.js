const pool = require('../db');

const CATEGORY_CONFIG = {
  inverters: {
    table: 'inverters',
    fields: ['brand', 'rated_power', 'type', 'battery_voltage', 'mppt_channels', 'mppt_max_current_a', 'mppt_max_voltage_v', 'grid_parallel_max', 'offgrid_parallel_max', 'warranty_months', 'price_usd', 'price_khr', 'sales_status'],
    numeric: ['rated_power', 'mppt_channels', 'mppt_max_current_a', 'mppt_max_voltage_v', 'grid_parallel_max', 'offgrid_parallel_max', 'warranty_months', 'price_usd', 'price_khr'],
    nullableNumeric: ['mppt_max_current_a', 'mppt_max_voltage_v'],
    enums: {
      type: ['off-grid', 'hybrid'],
      battery_voltage: ['12V', '24V', '48V'],
      sales_status: ['on_sale', 'discontinued'],
    },
    required: ['brand', 'rated_power', 'type', 'price_usd'],
    defaults: { battery_voltage: '48V', mppt_channels: 1, grid_parallel_max: 1, offgrid_parallel_max: 1, warranty_months: 24, price_khr: 0, sales_status: 'on_sale' },
  },
  panels: {
    table: 'solar_panels',
    fields: ['brand', 'rated_power', 'length_mm', 'width_mm', 'height_mm', 'voltage_min', 'voltage_max', 'voc_v', 'isc_a', 'glass_type', 'technology', 'warranty_months', 'price_usd', 'price_khr', 'sales_status'],
    numeric: ['rated_power', 'length_mm', 'width_mm', 'height_mm', 'voltage_min', 'voltage_max', 'voc_v', 'isc_a', 'warranty_months', 'price_usd', 'price_khr'],
    nullableNumeric: ['length_mm', 'width_mm', 'height_mm', 'voltage_min', 'voltage_max', 'voc_v', 'isc_a'],
    enums: { glass_type: ['single', 'double'], sales_status: ['on_sale', 'discontinued'] },
    required: ['brand', 'rated_power', 'price_usd'],
    defaults: { glass_type: 'single', warranty_months: 240, price_khr: 0, sales_status: 'on_sale', technology: [] },
    technology: true,
  },
  batteries: {
    table: 'batteries',
    fields: ['brand', 'capacity_kwh', 'nominal_voltage', 'type', 'discharge_rate', 'warranty_months', 'price_usd', 'price_khr', 'sales_status'],
    numeric: ['capacity_kwh', 'nominal_voltage', 'discharge_rate', 'warranty_months', 'price_usd', 'price_khr'],
    enums: {
      type: ['lead-acid', 'lithium-ternary', 'lfp'],
      sales_status: ['on_sale', 'discontinued'],
    },
    required: ['brand', 'capacity_kwh', 'type', 'price_usd'],
    defaults: { nominal_voltage: 48, discharge_rate: 0.5, warranty_months: 36, price_khr: 0, sales_status: 'on_sale' },
  },
};

const TECH_OPTIONS = ['N type', 'P type', 'Topcon', 'HTJ', 'BC'];

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function categoryConfig(category) {
  const cfg = CATEGORY_CONFIG[category];
  if (!cfg) throw httpError('invalid_category', 404);
  return cfg;
}

function normalizeProductPayload(category, body, { partial = false } = {}) {
  const cfg = categoryConfig(category);
  const input = body || {};
  const out = {};

  if (!partial) {
    Object.assign(out, cfg.defaults);
    if (cfg.technology && !('technology' in input)) out.technology = JSON.stringify([]);
  }

  for (const field of cfg.fields) {
    if (!(field in input)) continue;
    let value = input[field];

    if (cfg.technology && field === 'technology') {
      if (!Array.isArray(value)) throw httpError('invalid_technology');
      const invalid = value.find((v) => !TECH_OPTIONS.includes(v));
      if (invalid) throw httpError('invalid_technology');
      out[field] = JSON.stringify(value);
      continue;
    }

    if (cfg.enums[field]) {
      if (!cfg.enums[field].includes(value)) throw httpError(`invalid_${field}`);
      out[field] = value;
      continue;
    }

    if (cfg.numeric.includes(field)) {
      const isNullable = (cfg.nullableNumeric || []).includes(field);
      if (isNullable && (value === null || value === '' || value === undefined)) {
        out[field] = null;
        continue;
      }
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) throw httpError(`invalid_${field}`);
      if (field !== 'price_khr' && num === 0 && ['rated_power', 'capacity_kwh', 'price_usd'].includes(field)) {
        throw httpError(`invalid_${field}`);
      }
      const INT_FIELDS = ['rated_power', 'mppt_max_voltage_v'];
      const ONE_DECIMAL = ['mppt_max_current_a', 'voltage_min', 'voltage_max', 'voc_v', 'isc_a', 'nominal_voltage'];
      out[field] = INT_FIELDS.includes(field)
        ? Math.round(num)
        : ONE_DECIMAL.includes(field) ? Math.round(num * 10) / 10 : num;
      continue;
    }

    if (field === 'brand') {
      const text = String(value || '').trim();
      if (!text) throw httpError('brand_required');
      out[field] = text;
      continue;
    }

    out[field] = value;
  }

  if (!partial) {
    for (const field of cfg.required) {
      if (out[field] === undefined || out[field] === null || out[field] === '') {
        throw httpError(`${field}_required`);
      }
    }
  } else if ('brand' in out && !out.brand) {
    throw httpError('brand_required');
  }

  return out;
}

function mapProduct(category, row) {
  if (!row) return row;
  if (category === 'panels') {
    if (typeof row.technology === 'string') {
      try { row.technology = JSON.parse(row.technology); } catch { row.technology = []; }
    } else if (!Array.isArray(row.technology)) {
      row.technology = [];
    }
  }
  return row;
}

async function listPublic(category, conn = pool) {
  const cfg = categoryConfig(category);
  const [rows] = await conn.query(`SELECT * FROM ${cfg.table} WHERE sales_status = 'on_sale' ORDER BY id ASC`);
  return rows.map((r) => mapProduct(category, r));
}

async function listAdmin(category, status, conn = pool) {
  const cfg = categoryConfig(category);
  let sql = `SELECT * FROM ${cfg.table}`;
  const params = [];
  if (status && ['on_sale', 'discontinued'].includes(status)) {
    sql += ' WHERE sales_status = ?';
    params.push(status);
  }
  sql += ' ORDER BY id ASC';
  const [rows] = await conn.query(sql, params);
  return rows.map((r) => mapProduct(category, r));
}

async function getProduct(category, id, conn = pool) {
  const cfg = categoryConfig(category);
  const [rows] = await conn.query(`SELECT * FROM ${cfg.table} WHERE id = ?`, [id]);
  return mapProduct(category, rows[0] || null);
}

async function createProduct(category, body, conn = pool) {
  const cfg = categoryConfig(category);
  const data = normalizeProductPayload(category, body, { partial: false });
  const fields = Object.keys(data);
  const params = fields.map((f) => data[f]);
  const [result] = await conn.query(
    `INSERT INTO ${cfg.table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    params
  );
  return result.insertId;
}

async function updateProduct(category, id, body, conn = pool) {
  const cfg = categoryConfig(category);
  const data = normalizeProductPayload(category, body, { partial: true });
  const fields = Object.keys(data);
  if (!fields.length) throw httpError('no_updates');
  const params = fields.map((f) => data[f]);
  const [result] = await conn.query(
    `UPDATE ${cfg.table} SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...params, id]
  );
  if (result.affectedRows === 0) throw httpError('product_not_found', 404);
  return true;
}

async function deleteProduct(category, id, conn = pool) {
  const cfg = categoryConfig(category);
  const [result] = await conn.query(`DELETE FROM ${cfg.table} WHERE id = ?`, [id]);
  if (result.affectedRows === 0) throw httpError('product_not_found', 404);
  return true;
}

function tableForCategory(category) {
  return categoryConfig(category).table;
}

function categoryForTable(table) {
  const entry = Object.entries(CATEGORY_CONFIG).find(([, cfg]) => cfg.table === table);
  if (!entry) throw httpError('invalid_target_table');
  return entry[0];
}

module.exports = {
  CATEGORY_CONFIG,
  listPublic,
  listAdmin,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  tableForCategory,
  categoryForTable,
  normalizeProductPayload,
  httpError,
};
