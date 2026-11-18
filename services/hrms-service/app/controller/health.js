'use strict';

module.exports = {
  async health(ctx) {
    let database = 'ok';
    try {
      await ctx.app.db.query('SELECT 1');
    } catch (error) {
      database = 'unavailable';
    }
    ctx.status = database === 'ok' ? 200 : 503;
    ctx.body = {
      status: database === 'ok' ? 'ok' : 'degraded',
      service: 'hrms',
      database,
      uptime: process.uptime(),
    };
  },
};
