const express = require('express');
const pool = require('../db');
const router = express.Router();

// Helper to parse tech JSON
const parseTech = (row) => {
  if (row && row.technology) {
    try {
      row.technology = JSON.parse(row.technology);
    } catch {
      row.technology = [];
    }
  }
  return row;
};

/* ============================ INVERTERS ============================ */
router.get('/inverters', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM inverters ORDER BY rated_power ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/inverters', async (req, res) => {
  const { brand, rated_power, type, battery_voltage, mppt_channels, warranty_months, price_usd, price_khr } = req.body;
  try {
    const [r] = await pool.query(
      `INSERT INTO inverters (brand, rated_power, type, battery_voltage, mppt_channels, warranty_months, price_usd, price_khr)
       VALUES (?,?,?,?,?,?,?,?)`,
      [brand, rated_power, type, battery_voltage || '48V', mppt_channels || 1, warranty_months || 24, price_usd, price_khr || 0]
    );
    res.json({ id: r.insertId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/inverters/:id', async (req, res) => {
  const { id } = req.params;
  const fields = ['brand', 'rated_power', 'type', 'battery_voltage', 'mppt_channels', 'warranty_months', 'price_usd', 'price_khr'];
  const sets = [];
  const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f}=?`);
      vals.push(req.body[f]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(id);
  try {
    await pool.query(`UPDATE inverters SET ${sets.join(',')} WHERE id=?`, vals);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/inverters/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM inverters WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ============================ SOLAR PANELS ============================ */
router.get('/panels', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM solar_panels ORDER BY rated_power ASC');
    res.json(rows.map(parseTech));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/panels', async (req, res) => {
  const { brand, rated_power, length_mm, width_mm, height_mm, voltage_min, voltage_max, glass_type, technology, warranty_months, price_usd, price_khr } = req.body;
  try {
    const tech = technology ? JSON.stringify(technology) : '[]';
    const [r] = await pool.query(
      `INSERT INTO solar_panels (brand, rated_power, length_mm, width_mm, height_mm, voltage_min, voltage_max, glass_type, technology, warranty_months, price_usd, price_khr)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [brand, rated_power, length_mm || null, width_mm || null, height_mm || null, voltage_min || null, voltage_max || null, glass_type || 'single', tech, warranty_months || 240, price_usd, price_khr || 0]
    );
    res.json({ id: r.insertId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/panels/:id', async (req, res) => {
  const { id } = req.params;
  const fields = ['brand', 'rated_power', 'length_mm', 'width_mm', 'height_mm', 'voltage_min', 'voltage_max', 'glass_type', 'warranty_months', 'price_usd', 'price_khr'];
  const sets = [];
  const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f}=?`);
      vals.push(req.body[f]);
    }
  }
  if (req.body.technology !== undefined) {
    sets.push('technology=?');
    vals.push(JSON.stringify(req.body.technology));
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(id);
  try {
    await pool.query(`UPDATE solar_panels SET ${sets.join(',')} WHERE id=?`, vals);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/panels/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM solar_panels WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ============================ BATTERIES ============================ */
router.get('/batteries', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM batteries ORDER BY capacity_kwh ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/batteries', async (req, res) => {
  const { brand, capacity_kwh, nominal_voltage, type, discharge_rate, warranty_months, price_usd, price_khr } = req.body;
  try {
    const [r] = await pool.query(
      `INSERT INTO batteries (brand, capacity_kwh, nominal_voltage, type, discharge_rate, warranty_months, price_usd, price_khr)
       VALUES (?,?,?,?,?,?,?,?)`,
      [brand, capacity_kwh, nominal_voltage || 48, type, discharge_rate || 0.5, warranty_months || 36, price_usd, price_khr || 0]
    );
    res.json({ id: r.insertId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/batteries/:id', async (req, res) => {
  const { id } = req.params;
  const fields = ['brand', 'capacity_kwh', 'nominal_voltage', 'type', 'discharge_rate', 'warranty_months', 'price_usd', 'price_khr'];
  const sets = [];
  const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f}=?`);
      vals.push(req.body[f]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(id);
  try {
    await pool.query(`UPDATE batteries SET ${sets.join(',')} WHERE id=?`, vals);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/batteries/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM batteries WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
