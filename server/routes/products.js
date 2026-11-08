const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const catalog = require('../services/catalog');
const approvals = require('../services/approvals');

const STAFF_ROLES = ['super_admin', 'sales_manager', 'salesperson'];
const DIRECT_ROLES = ['super_admin', 'sales_manager'];

function sendError(res, e) {
  res.status(e.status || 500).json({ error: e.message });
}

function pickProductFields(category, body) {
  const cfg = catalog.CATEGORY_CONFIG[category];
  const out = {};
  for (const field of cfg.fields) {
    if (field in (body || {})) out[field] = body[field];
  }
  return out;
}

/* Public catalog: on-sale products only */
router.get('/:category', async (req, res) => {
  try {
    res.json(await catalog.listPublic(req.params.category));
  } catch (e) {
    sendError(res, e);
  }
});

/* Admin catalog: includes discontinued products */
router.get('/admin/:category', requireAuth, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    res.json(await catalog.listAdmin(req.params.category, req.query.status));
  } catch (e) {
    sendError(res, e);
  }
});

/* Create */
router.post('/:category', requireAuth, async (req, res) => {
  const category = req.params.category;
  try {
    const data = pickProductFields(category, req.body);
    catalog.normalizeProductPayload(category, data, { partial: false });

    if (DIRECT_ROLES.includes(req.user.role)) {
      const id = await catalog.createProduct(category, data);
      return res.json({ id });
    }

    const approvalId = await approvals.createRequest({
      requesterId: req.user.id,
      requestType: 'product_create',
      approverRole: 'sales_manager',
      targetTable: catalog.tableForCategory(category),
      payload: data,
      reason: req.body.reason || null,
    });
    res.status(202).json({ approval_id: approvalId, status: 'pending' });
  } catch (e) {
    sendError(res, e);
  }
});

/* Update */
router.put('/:category/:id', requireAuth, async (req, res) => {
  const category = req.params.category;
  const id = Number(req.params.id);
  try {
    const data = pickProductFields(category, req.body);
    catalog.normalizeProductPayload(category, data, { partial: true });
    const existing = await catalog.getProduct(category, id);
    if (!existing) return res.status(404).json({ error: 'product_not_found' });

    if (DIRECT_ROLES.includes(req.user.role)) {
      await catalog.updateProduct(category, id, data);
      return res.json({ ok: true });
    }

    const approvalId = await approvals.createRequest({
      requesterId: req.user.id,
      requestType: 'product_update',
      approverRole: 'sales_manager',
      targetTable: catalog.tableForCategory(category),
      targetId: id,
      payload: data,
      reason: req.body.reason || null,
    });
    res.status(202).json({ approval_id: approvalId, status: 'pending' });
  } catch (e) {
    sendError(res, e);
  }
});

/* Delete */
router.delete('/:category/:id', requireAuth, async (req, res) => {
  const category = req.params.category;
  const id = Number(req.params.id);
  try {
    const existing = await catalog.getProduct(category, id);
    if (!existing) return res.status(404).json({ error: 'product_not_found' });

    if (DIRECT_ROLES.includes(req.user.role)) {
      await catalog.deleteProduct(category, id);
      return res.json({ ok: true });
    }

    const approvalId = await approvals.createRequest({
      requesterId: req.user.id,
      requestType: 'product_delete',
      approverRole: 'sales_manager',
      targetTable: catalog.tableForCategory(category),
      targetId: id,
      payload: { id, brand: existing.brand },
      reason: req.body.reason || null,
    });
    res.status(202).json({ approval_id: approvalId, status: 'pending' });
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;
