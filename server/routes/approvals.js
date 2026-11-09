const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const approvals = require('../services/approvals');
const accounts = require('../services/accounts');

const router = express.Router();

router.use(requireAuth);

function sendError(res, e) {
  const err = accounts.mapDuplicateError(e);
  res.status(err.status || 500).json({ error: err.message });
}

router.get('/', async (req, res) => {
  try {
    const role = req.user.role;
    if (role === 'member') return res.status(403).json({ error: 'forbidden' });

    const scope = req.query.scope || (role === 'super_admin' ? 'all' : role === 'sales_manager' ? 'to_review' : 'mine');
    const conditions = [];
    const params = [];

    if (role === 'super_admin') {
      if (scope === 'mine') {
        conditions.push('ar.requester_id = ?');
        params.push(req.user.id);
      }
    } else if (role === 'sales_manager') {
      if (scope === 'mine') {
        conditions.push('ar.requester_id = ?');
        params.push(req.user.id);
      } else {
        conditions.push('ar.status = ?');
        params.push('pending');
        conditions.push(`(
          (ar.status = 'pending' AND ar.request_type LIKE 'product_%' AND ar.approver_role = 'sales_manager'
            AND EXISTS (SELECT 1 FROM sales_manager_links l WHERE l.salesperson_id = ru.id AND l.manager_id = ?))
          OR (ar.request_type = 'account_register' AND ar.approver_role = 'sales_manager' AND ar.approver_id = ?)
        )`);
        params.push(req.user.id, req.user.id);
      }
    } else {
      conditions.push('ar.requester_id = ?');
      params.push(req.user.id);
    }

    if (req.query.status && ['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status)) {
      conditions.push('ar.status = ?');
      params.push(req.query.status);
    }
    if (req.query.request_type) {
      conditions.push('ar.request_type = ?');
      params.push(req.query.request_type);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT ar.*,
         COALESCE(ru.username, JSON_UNQUOTE(JSON_EXTRACT(ar.payload, '$.username'))) AS requester_username,
         au.username AS approver_username
       FROM approval_requests ar
       LEFT JOIN users ru ON ru.id = ar.requester_id
       LEFT JOIN users au ON au.id = ar.approver_id
       ${where}
       ORDER BY ar.created_at DESC, ar.id DESC
       LIMIT 200`,
      params
    );
    res.json(rows.map(approvals.sanitizeApproval));
  } catch (e) {
    sendError(res, e);
  }
});

async function loadForUpdate(conn, id) {
  const [rows] = await conn.query(
    `SELECT ar.*, ru.username AS requester_username,
       (SELECT l.manager_id FROM sales_manager_links l WHERE l.salesperson_id = ru.id) AS requester_manager_id
     FROM approval_requests ar
     LEFT JOIN users ru ON ru.id = ar.requester_id
     WHERE ar.id = ? FOR UPDATE`,
    [id]
  );
  return rows[0] || null;
}

function canReview(user, approval) {
  if (user.role === 'super_admin') return true;
  if (user.role !== 'sales_manager') return false;
  if (Number(approval.requester_id) === Number(user.id)) return false;
  if (approval.request_type === 'account_register') {
    // A salesperson registration is reviewed by the sales manager they picked.
    // Sales manager registrations use approver_role = super_admin, so they are
    // never reviewable here.
    return approval.approver_role === 'sales_manager'
      && Number(approval.approver_id) === Number(user.id);
  }
  return approval.approver_role === 'sales_manager'
    && String(approval.request_type).startsWith('product_')
    && Number(approval.requester_manager_id) === Number(user.id);
}

router.post('/:id/approve', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const approval = await loadForUpdate(conn, Number(req.params.id));
    if (!approval) {
      await conn.rollback();
      return res.status(404).json({ error: 'approval_not_found' });
    }
    if (approval.status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: 'approval_not_pending' });
    }
    if (!canReview(req.user, approval)) {
      await conn.rollback();
      return res.status(403).json({ error: 'forbidden' });
    }
    const result = await approvals.applyRequest(conn, approval);
    await conn.query(
      "UPDATE approval_requests SET status = 'approved', approver_id = ?, reviewed_at = NOW() WHERE id = ?",
      [req.user.id, approval.id]
    );
    await conn.commit();
    res.json({ ok: true, applied: result });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    sendError(res, e);
  } finally {
    conn.release();
  }
});

router.post('/:id/reject', async (req, res) => {
  const note = String(req.body.review_note || '').trim();
  if (!note) return res.status(400).json({ error: 'review_note_required' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const approval = await loadForUpdate(conn, Number(req.params.id));
    if (!approval) {
      await conn.rollback();
      return res.status(404).json({ error: 'approval_not_found' });
    }
    if (approval.status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: 'approval_not_pending' });
    }
    if (!canReview(req.user, approval)) {
      await conn.rollback();
      return res.status(403).json({ error: 'forbidden' });
    }
    await conn.query(
      "UPDATE approval_requests SET status = 'rejected', approver_id = ?, review_note = ?, reviewed_at = NOW() WHERE id = ?",
      [req.user.id, note, approval.id]
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    sendError(res, e);
  } finally {
    conn.release();
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, requester_id, status FROM approval_requests WHERE id = ?', [req.params.id]);
    const approval = rows[0];
    if (!approval) return res.status(404).json({ error: 'approval_not_found' });
    if (approval.requester_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    if (approval.status !== 'pending') return res.status(409).json({ error: 'approval_not_pending' });
    await pool.query("UPDATE approval_requests SET status = 'cancelled', reviewed_at = NOW() WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;
