const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { buildQuote } = require('../services/pricing');

router.post('/', optionalAuth, async (req, res) => {
  const hasSelection = req.body.inverter_id || req.body.battery_id || req.body.panel_id;
  if (hasSelection && (!req.user || req.user.role !== 'member')) {
    return res.status(403).json({ error: 'registration_required_for_exact_quote' });
  }
  try {
    const quote = await buildQuote(req.body, req.user);
    res.json(quote);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, params: e.params });
  }
});

module.exports = router;
