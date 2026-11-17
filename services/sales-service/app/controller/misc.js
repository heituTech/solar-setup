'use strict';

module.exports = {
  async config(ctx) {
    ctx.body = {
      config: {
        currency: 'USD',
        usd_to_khr: 4100,
        install_percent: 0.12,
        install_min_usd: 300,
      },
    };
  },

  async geo(ctx) {
    ctx.body = { countries: [], regions: [] };
  },

  async skill(ctx) {
    ctx.body = {
      name: 'solar-setup',
      version: '2.0.0',
      endpoints: [
        'POST /pv/api/auth/login',
        'GET /pv/api/workbench/customers',
        'POST /pv/api/workbench/quotes',
        'POST /pv/api/workbench/quotes/:id/convert',
        'GET /pv/api/workbench/ledger',
      ],
    };
  },
};
