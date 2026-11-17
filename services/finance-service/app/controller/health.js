'use strict';

module.exports = {
  async health(ctx) {
    ctx.body = {
      status: 'ok',
      service: 'finance',
      time: new Date().toISOString(),
      request_id: ctx.state.requestId,
    };
  },
};
