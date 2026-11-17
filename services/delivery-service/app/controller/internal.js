'use strict';

const { consumeInbox, enqueueEvent } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');

module.exports = {
  async events(ctx) {
    const event = ctx.request.body || {};
    if (!event.event_id || !event.event_type) ctx.throw(400, 'invalid_event');
    const payload = event.payload || {};
    const result = await consumeInbox(ctx.app.db, event, async (connection) => {
      if (event.event_type !== EVENTS.ORDER_CONVERTED) return null;
      const orderId = Number(payload.order_id);
      const [existing] = await connection.query('SELECT id FROM projects WHERE order_id = ?', [orderId]);
      if (existing.length) return null;
      const [inserted] = await connection.query(
        `INSERT INTO projects (order_id, order_no, customer_id, customer_name, address, salesperson_id, amount, status)
         VALUES (?,?,?,?,?,?,?,?)`,
        [orderId, payload.order_no, Number(payload.customer_id), payload.customer_name,
          payload.address || null, Number(payload.salesperson_id || 0) || null, Number(payload.amount || 0), 'pending_assignment']
      );
      await connection.query(
        'INSERT INTO project_progress (project_id, stage, note, actor_id, actor_name) VALUES (?,?,?,?,?)',
        [inserted.insertId, 'created', 'Order converted', event.actor_id || null, 'system']
      );
      await enqueueEvent(connection, {
        type: EVENTS.PROJECT_PROGRESS_CHANGED,
        aggregateId: inserted.insertId,
        customerId: Number(payload.customer_id),
        actorId: event.actor_id || null,
        requestId: event.request_id || null,
        destinations: ['sales'],
        payload: {
          project_id: Number(inserted.insertId),
          order_id: orderId,
          status: 'pending_assignment',
          stage: 'created',
        },
      });
      return null;
    });
    ctx.body = { ok: true, duplicate: result.duplicate };
  },
};
