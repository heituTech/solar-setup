const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const flows = require('../services/flows');

const router = express.Router();

router.use(requireAuth, requireRole('super_admin'));

function sendError(res, e) {
  res.status(e.status || 500).json({ error: e.message });
}

router.get('/', async (req, res) => {
  try {
    res.json(await flows.listFlows());
  } catch (e) {
    sendError(res, e);
  }
});

router.post('/', async (req, res) => {
  try {
    const id = await flows.createFlow(req.body || {});
    res.status(201).json({ id });
  } catch (e) {
    sendError(res, e);
  }
});

router.put('/:id', async (req, res) => {
  try {
    await flows.updateFlow(Number(req.params.id), req.body || {});
    res.json({ ok: true });
  } catch (e) {
    sendError(res, e);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await flows.deleteFlow(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;
