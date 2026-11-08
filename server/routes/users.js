const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const accounts = require('../services/accounts');
const approvals = require('../services/approvals');

const router = express.Router();

router.use(requireAuth);

function sendError(res, e) {
  const err = accounts.mapDuplicateError(e);
  res.status(err.status || 500).json({ error: err.message });
}

const STAFF_FIELDS = `u.id, u.username, u.email, u.role, u.status, u.phone, u.created_at,
  l.manager_id, m.username AS manager_username`;
const STAFF_JOIN = `LEFT JOIN sales_manager_links l ON l.salesperson_id = u.id
  LEFT JOIN users m ON m.id = l.manager_id`;

/* ===================== Super admin: direct staff management ===================== */

router.get('/', requireRole('super_admin'), async (req, res) => {
  try {
    const params = [];
    let where = "u.role IN ('sales_manager','salesperson')";
    if (req.query.role === 'sales_manager' || req.query.role === 'salesperson') {
      where = 'u.role = ?';
      params.push(req.query.role);
    }
    const [rows] = await pool.query(
      `SELECT ${STAFF_FIELDS} FROM users u ${STAFF_JOIN}
       WHERE ${where} ORDER BY u.role ASC, u.id ASC`,
      params
    );
    res.json(rows);
  } catch (e) {
    sendError(res, e);
  }
});

router.post('/', requireRole('super_admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const data = {
      username: req.body.username,
      email: req.body.email,
      phone: req.body.phone,
      role: req.body.role,
      manager_id: req.body.manager_id,
      password: req.body.password,
      password_hash: req.body.password ? accounts.hashPassword(req.body.password) : null,
    };
    const id = await accounts.createStaff(conn, data, ['sales_manager', 'salesperson']);
    await conn.commit();
    const [rows] = await pool.query(`SELECT ${STAFF_FIELDS} FROM users u ${STAFF_JOIN} WHERE u.id = ?`, [id]);
    res.status(201).json(rows[0]);
  } catch (e) {
    try { await conn.rollback(); } catch {}
    sendError(res, e);
  } finally {
    conn.release();
  }
});

router.put('/:id', requireRole('super_admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const changes = {};
    for (const key of ['username', 'email', 'phone', 'status', 'manager_id']) {
      if (key in req.body) changes[key] = req.body[key];
    }
    if (req.body.password) changes.password_hash = accounts.hashPassword(req.body.password);
    await accounts.updateStaff(conn, Number(req.params.id), changes, ['sales_manager', 'salesperson']);
    await conn.commit();
    const [rows] = await pool.query(`SELECT ${STAFF_FIELDS} FROM users u ${STAFF_JOIN} WHERE u.id = ?`, [req.params.id]);
    res.json(rows[0]);
  } catch (e) {
    try { await conn.rollback(); } catch {}
    sendError(res, e);
  } finally {
    conn.release();
  }
});

router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await accounts.deleteStaff(conn, Number(req.params.id), ['sales_manager', 'salesperson']);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    sendError(res, e);
  } finally {
    conn.release();
  }
});

/* ===================== Sales manager: subordinate requests ===================== */

router.get('/subordinates', requireRole('sales_manager'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${STAFF_FIELDS}
       FROM users u ${STAFF_JOIN}
       WHERE u.role = 'salesperson' AND l.manager_id = ?
       ORDER BY u.id ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    sendError(res, e);
  }
});

router.post('/subordinates', requireRole('sales_manager'), async (req, res) => {
  try {
    const username = accounts.normalizeUsername(req.body.username);
    if (!username) return res.status(400).json({ error: 'username_required' });
    if (!req.body.password) return res.status(400).json({ error: 'password_required' });
    const payload = {
      username,
      email: req.body.email ? accounts.normalizeEmail(req.body.email) : null,
      phone: req.body.phone || null,
      role: 'salesperson',
      manager_id: req.user.id,
      password_hash: accounts.hashPassword(req.body.password),
    };
    const approvalId = await approvals.createRequest({
      requesterId: req.user.id,
      requestType: 'account_create',
      approverRole: 'super_admin',
      targetTable: 'users',
      payload,
      reason: req.body.reason || null,
    });
    res.status(202).json({ approval_id: approvalId, status: 'pending' });
  } catch (e) {
    sendError(res, e);
  }
});

async function findSubordinate(managerId, id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.username FROM users u
     JOIN sales_manager_links l ON l.salesperson_id = u.id
     WHERE u.id = ? AND u.role = 'salesperson' AND l.manager_id = ?`,
    [id, managerId]
  );
  return rows[0] || null;
}

router.put('/subordinates/:id', requireRole('sales_manager'), async (req, res) => {
  try {
    const target = await findSubordinate(req.user.id, Number(req.params.id));
    if (!target) return res.status(404).json({ error: 'subordinate_not_found' });
    const changes = {};
    for (const key of ['username', 'email', 'phone', 'status']) {
      if (key in req.body) changes[key] = req.body[key];
    }
    if (req.body.password) changes.password_hash = accounts.hashPassword(req.body.password);
    if (!Object.keys(changes).length) return res.status(400).json({ error: 'no_updates' });
    const approvalId = await approvals.createRequest({
      requesterId: req.user.id,
      requestType: 'account_update',
      approverRole: 'super_admin',
      targetTable: 'users',
      targetId: target.id,
      payload: changes,
      reason: req.body.reason || null,
    });
    res.status(202).json({ approval_id: approvalId, status: 'pending' });
  } catch (e) {
    sendError(res, e);
  }
});

router.delete('/subordinates/:id', requireRole('sales_manager'), async (req, res) => {
  try {
    const target = await findSubordinate(req.user.id, Number(req.params.id));
    if (!target) return res.status(404).json({ error: 'subordinate_not_found' });
    const approvalId = await approvals.createRequest({
      requesterId: req.user.id,
      requestType: 'account_delete',
      approverRole: 'super_admin',
      targetTable: 'users',
      targetId: target.id,
      payload: { username: target.username },
      reason: req.body.reason || null,
    });
    res.status(202).json({ approval_id: approvalId, status: 'pending' });
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;
