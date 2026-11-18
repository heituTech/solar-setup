'use strict';

const { buildPerformance } = require('../../lib/performance');
const { fetchContacts } = require('../../lib/reports');
const { currentPeriod, assertPeriod } = require('../../lib/rules');

async function load(ctx) {
  const period = String(ctx.query.period || currentPeriod());
  assertPeriod(period);
  const users = await fetchContacts(ctx.app.config);
  return buildPerformance(ctx.app.db, period, users);
}

module.exports = {
  async list(ctx) {
    const { period, rule, rows, team } = await load(ctx);
    let filtered = rows;
    const q = String(ctx.query.q || '').trim().toLowerCase();
    if (q) filtered = filtered.filter((row) => String(row.name || '').toLowerCase().includes(q));
    if (ctx.query.salesperson_id) {
      const id = Number(ctx.query.salesperson_id);
      filtered = filtered.filter((row) => row.salesperson_id === id);
    }
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    ctx.body = {
      period,
      rule,
      team,
      total: filtered.length,
      page,
      page_size: pageSize,
      rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    };
  },

  async team(ctx) {
    const { period, rule, team } = await load(ctx);
    ctx.body = { period, rule, team };
  },
};
