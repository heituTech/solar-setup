const express = require('express');
const pool = require('../db');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const COUNTRIES = require('../data/countries');

const PUBLIC_KEYS = [
  'default_peak_sun_hours',
  'default_currency',
  'usd_to_khr',
  'installation_fee_percent',
  'installation_fee_ground_percent',
  'installation_fee_rooftop_percent',
  'installation_fee_min_usd',
  'battery_price_lfp_per_kwh',
  'battery_price_ternary_per_kwh',
  'battery_price_lead_acid_per_kwh',
];

function validateConfig(key, value) {
  if (key === 'default_currency') {
    if (!['USD', 'KHR'].includes(String(value))) throw new Error('invalid_currency');
    return String(value);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`invalid_${key}`);
  if (key === 'installation_fee_percent' && num > 100) throw new Error('invalid_installation_fee_percent');
  return String(num);
}

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT config_key, config_value FROM system_config WHERE config_key IN (${PUBLIC_KEYS.map(() => '?').join(',')})`,
      PUBLIC_KEYS
    );
    const obj = {};
    rows.forEach((r) => (obj[r.config_key] = r.config_value));
    res.json(obj);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/countries', (req, res) => {
  res.json({ countries: COUNTRIES });
});

router.put('/', requireAuth, requireRole('super_admin', 'sales_manager'), async (req, res) => {
  const updates = req.body.updates;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'no_updates' });
  const accepted = {};
  try {
    for (const [key, value] of Object.entries(updates)) {
      if (!PUBLIC_KEYS.includes(key)) continue;
      accepted[key] = validateConfig(key, value);
    }
    if (!Object.keys(accepted).length) return res.status(400).json({ error: 'no_valid_updates' });
    for (const [key, value] of Object.entries(accepted)) {
      await pool.query(
        'INSERT INTO system_config (config_key, config_value) VALUES (?,?) ON DUPLICATE KEY UPDATE config_value=VALUES(config_value)',
        [key, value]
      );
    }
    res.json({ ok: true, updated: accepted });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
