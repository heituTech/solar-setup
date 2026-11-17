'use strict';

module.exports = {
  async health(ctx) {
    ctx.body = {
      status: 'ok',
      service: 'delivery',
      time: new Date().toISOString(),
      request_id: ctx.state.requestId,
    };
  },
};
