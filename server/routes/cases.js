const express = require('express');
const pool = require('../db');
const catalog = require('../services/catalog');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_INSTALL_TYPES = ['ground', 'rooftop'];
const VALID_MODES = ['off-grid', 'hybrid'];
const VALID_SCENARIOS = ['house', 'supermarket', 'resort', 'cafe'];
const MAX_LOAD_ITEMS = 50;

function parseLoadItems(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }
  return value;
}

function sanitizeLoadItems(raw) {
  let list = parseLoadItems(raw);
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const item of list.slice(0, MAX_LOAD_ITEMS)) {
    if (!item || typeof item !== 'object') continue;
    const power = Number(item.power);
    const qty = Number(item.qty);
    const dayHours = Number(item.day_hours);
    const nightHours = Number(item.night_hours);
    if (![power, qty, dayHours, nightHours].every((n) => Number.isFinite(n) && n >= 0)) continue;
    out.push({
      name_key: typeof item.name_key === 'string' && item.name_key ? item.name_key.slice(0, 60) : null,
      name: typeof item.name === 'string' ? item.name.slice(0, 80) : null,
      power,
      qty,
      day_hours: Math.min(8, dayHours),
      night_hours: Math.min(16, nightHours),
      critical: Boolean(item.critical),
    });
  }
  return out;
}

function parseJsonColumn(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

// Newest product change across all on-sale categories. A saved recommendation is
// stale once any product is added or updated after it was generated.
async function catalogUpdatedAt() {
  return catalog.latestUpdatedAt();
}

function sanitize(row) {
  return {
    id: row.id,
    member_id: row.member_id,
    name: row.name,
    usage_scenario: row.usage_scenario || null,
    load_items: sanitizeLoadItems(row.load_items),
    address: row.address,
    has_grid: Boolean(row.has_grid),
    install_type: row.install_type,
    system_mode: row.system_mode,
    electricity_price: row.electricity_price === null || row.electricity_price === undefined ? null : Number(row.electricity_price),
    electricity_price_currency: row.electricity_price_currency || 'USD',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validate(body, partial) {
  const data = {};
  if (!partial || body.name !== undefined) {
    data.name = body.name === undefined || body.name === null ? null : String(body.name).trim().slice(0, 100) || null;
  }
  if (!partial || body.usage_scenario !== undefined) {
    const raw = body.usage_scenario;
    if (raw === null || raw === undefined || raw === '') {
      data.usage_scenario = null;
    } else if (!VALID_SCENARIOS.includes(raw)) {
      throw Object.assign(new Error('invalid_usage_scenario'), { status: 400 });
    } else {
      data.usage_scenario = raw;
    }
  }
  if (!partial || body.load_items !== undefined) {
    if (body.load_items === null || body.load_items === undefined) {
      data.load_items = null;
    } else {
      const items = sanitizeLoadItems(body.load_items);
      if (!items || !Array.isArray(parseLoadItems(body.load_items))) {
        throw Object.assign(new Error('invalid_load_items'), { status: 400 });
      }
      data.load_items = JSON.stringify(items);
    }
  }
  if (!partial || body.address !== undefined) {
    const address = String(body.address || '').trim();
    if (!address) throw Object.assign(new Error('project_address_required'), { status: 400 });
    data.address = address.slice(0, 255);
  }
  if (!partial || body.has_grid !== undefined) {
    data.has_grid = body.has_grid ? 1 : 0;
  }
  if (!partial || body.install_type !== undefined) {
    if (!VALID_INSTALL_TYPES.includes(body.install_type)) throw Object.assign(new Error('invalid_install_type'), { status: 400 });
    data.install_type = body.install_type;
  }
  if (!partial || body.system_mode !== undefined) {
    if (!VALID_MODES.includes(body.system_mode)) throw Object.assign(new Error('invalid_system_mode'), { status: 400 });
    data.system_mode = body.system_mode;
  }
  if (!partial || body.electricity_price !== undefined) {
    const raw = body.electricity_price;
    const value = raw === '' || raw === null || raw === undefined ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      throw Object.assign(new Error('invalid_electricity_price'), { status: 400 });
    }
    data.electricity_price = value;
  }
  if (!partial || body.electricity_price_currency !== undefined) {
    const currency = String(body.electricity_price_currency || 'USD').toUpperCase();
    if (!['USD', 'KHR'].includes(currency)) throw Object.assign(new Error('invalid_currency'), { status: 400 });
    data.electricity_price_currency = currency;
  }
  return data;
}

router.use(requireAuth, requireRole('member'));

router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM cases WHERE member_id = ? ORDER BY updated_at DESC', [req.user.id]);
  res.json(rows.map(sanitize));
});

// Single case with the last saved recommendation (inputs + result) so the
// configurator can restore it when reopened.
router.get('/:id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM cases WHERE id = ? AND member_id = ?', [req.params.id, req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'case_not_found' });
  const row = rows[0];
  const input = parseJsonColumn(row.quote_input);
  const result = parseJsonColumn(row.quote_result);
  let catalogStale = false;
  if (row.quote_saved_at) {
    const latest = await catalogUpdatedAt();
    const saved = row.quote_catalog_ts || row.quote_saved_at;
    catalogStale = Boolean(latest && saved && new Date(latest).getTime() > new Date(saved).getTime());
  }
  res.json({
    ...sanitize(row),
    quote: input || result
      ? { input, result, saved_at: row.quote_saved_at, catalog_stale: catalogStale }
      : null,
  });
});

router.post('/', async (req, res) => {
  try {
    const data = validate(req.body, false);
    const [r] = await pool.query(
      'INSERT INTO cases (member_id, name, usage_scenario, load_items, address, has_grid, install_type, system_mode, electricity_price, electricity_price_currency) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [req.user.id, data.name, data.usage_scenario, data.load_items, data.address, data.has_grid, data.install_type, data.system_mode, data.electricity_price, data.electricity_price_currency]
    );
    const [rows] = await pool.query('SELECT * FROM cases WHERE id = ?', [r.insertId]);
    res.status(201).json(sanitize(rows[0]));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM cases WHERE id = ? AND member_id = ?', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'case_not_found' });
    const data = validate(req.body, true);
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ error: 'no_updates' });
    await pool.query(`UPDATE cases SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), req.params.id]);
    const [fresh] = await pool.query('SELECT * FROM cases WHERE id = ?', [req.params.id]);
    res.json(sanitize(fresh[0]));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Quote snapshots are computed in the browser now, so the client stores the
// inputs and result it produced for this case.
router.put('/:id/quote', async (req, res) => {
  const { input, result } = req.body || {};
  if (!input || typeof input !== 'object' || !result || typeof result !== 'object') {
    return res.status(400).json({ error: 'invalid_quote_snapshot' });
  }
  const [rows] = await pool.query('SELECT id FROM cases WHERE id = ? AND member_id = ?', [req.params.id, req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'case_not_found' });
  const catalogTs = await catalog.latestUpdatedAt();
  await pool.query(
    'UPDATE cases SET quote_input = ?, quote_result = ?, quote_saved_at = NOW(), quote_catalog_ts = ? WHERE id = ?',
    [JSON.stringify(input), JSON.stringify(result), catalogTs, req.params.id]
  );
  res.json({ ok: true, saved_at: new Date().toISOString() });
});

router.delete('/:id', async (req, res) => {
  const [r] = await pool.query('DELETE FROM cases WHERE id = ? AND member_id = ?', [req.params.id, req.user.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'case_not_found' });
  res.json({ message: 'deleted' });
});

module.exports = router;
