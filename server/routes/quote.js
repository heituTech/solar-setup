const express = require('express');
const router = express.Router();
const pool = require('../db');
const catalog = require('../services/catalog');
const { optionalAuth } = require('../middleware/auth');
const { buildQuote } = require('../services/pricing');

// Persist the recommendation on the member's case so reopening the configurator
// restores the same inputs and result.
async function saveCaseQuote(memberId, caseId, body, quote) {
  const input = {
    day_peak_power: quote.input.day_peak_power,
    day_hours: quote.input.day_hours,
    night_peak_power: quote.input.night_peak_power,
    night_hours: quote.input.night_hours,
    backup_peak_power: quote.input.backup_peak_power,
    autonomy_days: quote.input.autonomy_days,
    strategy: quote.input.strategy,
    battery_type: quote.input.battery_type,
    inverter_id: body.inverter_id ? Number(body.inverter_id) : null,
    battery_id: body.battery_id ? Number(body.battery_id) : null,
    panel_id: body.panel_id ? Number(body.panel_id) : null,
    panel_qty: body.panel_id && body.panel_qty !== undefined && body.panel_qty !== ''
      ? Number(body.panel_qty) : null,
  };
  const catalogTs = await catalog.latestUpdatedAt();
  await pool.query(
    'UPDATE cases SET quote_input = ?, quote_result = ?, quote_saved_at = NOW(), quote_catalog_ts = ? WHERE id = ? AND member_id = ?',
    [JSON.stringify(input), JSON.stringify(quote), catalogTs, caseId, memberId]
  );
}

router.post('/', optionalAuth, async (req, res) => {
  const hasSelection = req.body.inverter_id || req.body.battery_id || req.body.panel_id;
  if (hasSelection && (!req.user || req.user.role !== 'member')) {
    return res.status(403).json({ error: 'registration_required_for_exact_quote' });
  }
  try {
    const quote = await buildQuote(req.body, req.user);
    if (req.user && req.user.role === 'member' && req.body.case_id && quote.case) {
      try {
        await saveCaseQuote(req.user.id, Number(req.body.case_id), req.body, quote);
      } catch (e) {
        // A failed snapshot must never block the quote itself.
        console.error('Failed to save case quote:', e.message);
      }
    }
    res.json(quote);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, params: e.params });
  }
});

module.exports = router;
