'use strict';

const { internalFetch } = require('@solar/service-kit');

module.exports = {
  async health(ctx) {
    ctx.body = {
      status: 'ok',
      service: 'identity',
      time: new Date().toISOString(),
      request_id: ctx.state.requestId,
    };
  },

  async overview(ctx) {
    const services = ctx.app.config.internal.services || {};
    const checks = await Promise.all(Object.entries(services).map(async ([name, url]) => {
      const started = Date.now();
      try {
        const data = await internalFetch(`${url}/health`, {
          service: 'identity',
          requestId: ctx.state.requestId,
          timeoutMs: 3000,
        });
        return { service: name, status: data.status || 'ok', latency_ms: Date.now() - started, time: data.time || null };
      } catch (error) {
        return { service: name, status: 'down', latency_ms: Date.now() - started, error: error.message };
      }
    }));
    ctx.body = { services: checks, checked_at: new Date().toISOString() };
  },
};
