'use strict';

module.exports = {
  async health(ctx) {
    ctx.body = {
      status: 'ok',
      service: 'sales',
      time: new Date().toISOString(),
      request_id: ctx.state.requestId,
    };
  },
};
