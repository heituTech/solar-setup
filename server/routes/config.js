const express = require('express');
const pool = require('../db');
const router = express.Router();

// Get all public config (exclude admin_password)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT config_key, config_value FROM system_config WHERE config_key != 'admin_password'");
    const obj = {};
    rows.forEach((r) => (obj[r.config_key] = r.config_value));
    res.json(obj);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Verify admin password
router.post('/auth', async (req, res) => {
  const { password } = req.body;
  try {
    const [rows] = await pool.query("SELECT config_value FROM system_config WHERE config_key='admin_password'");
    if (rows.length && rows[0].config_value === password) {
      res.json({ ok: true });
    } else {
      res.status(401).json({ error: 'Wrong password' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update config (admin only - simple password check)
router.put('/', async (req, res) => {
  const { password, updates } = req.body;
  if (!updates) return res.status(400).json({ error: 'No updates' });
  try {
    const [rows] = await pool.query("SELECT config_value FROM system_config WHERE config_key='admin_password'");
    if (!rows.length || rows[0].config_value !== password) {
      return res.status(401).json({ error: 'Wrong password' });
    }
    for (const [k, v] of Object.entries(updates)) {
      await pool.query(
        'INSERT INTO system_config (config_key, config_value) VALUES (?,?) ON DUPLICATE KEY UPDATE config_value=VALUES(config_value)',
        [k, String(v)]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
