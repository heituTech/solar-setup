'use strict';

const { consumeInbox } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');

function toDbDate(value) {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function applyProductChange(connection, payload) {
  if (!payload || payload.approval_type !== 'product_change' || payload.decision !== 'approved') return;
  const request = payload.request_payload || {};
  const product = request.product || {};
  if (request.action === 'create') {
    return connection.query(
      'INSERT INTO products (category, model, name, specs, price, unit, status, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [product.category || 'general', product.model || 'N/A', product.name || 'Unnamed',
        JSON.stringify(product.specs || {}), Number(product.price || 0), product.unit || null,
        'active', payload.requester_id || null]
    );
  }
  if (request.action === 'update' && request.product_id) {
    const assignments = [];
    const params = [];
    for (const field of ['category', 'model', 'name', 'unit', 'status']) {
      if (product[field] !== undefined) { assignments.push(`${field} = ?`); params.push(String(product[field])); }
    }
    if (product.price !== undefined) { assignments.push('price = ?'); params.push(Number(product.price)); }
    if (product.specs !== undefined) { assignments.push('specs = ?'); params.push(JSON.stringify(product.specs)); }
    if (!assignments.length) return null;
    params.push(Number(request.product_id));
    return connection.query(`UPDATE products SET ${assignments.join(', ')} WHERE id = ?`, params);
  }
  return null;
}

module.exports = {
  async events(ctx) {
    const event = ctx.request.body || {};
    if (!event.event_id || !event.event_type) ctx.throw(400, 'invalid_event');
    const payload = event.payload || {};
    const result = await consumeInbox(ctx.app.db, event, async (connection) => {
      if (event.event_type === EVENTS.PROJECT_PROGRESS_CHANGED) {
        await connection.query(
          'UPDATE orders SET project_id = COALESCE(?, project_id), status = ? WHERE id = ?',
          [payload.project_id || null, payload.status || 'in_delivery', payload.order_id]
        );
      } else if (event.event_type === EVENTS.PROJECT_ACCEPTED) {
        await connection.query(
          "UPDATE orders SET project_id = COALESCE(?, project_id), status = 'accepted', accepted_at = ? WHERE id = ?",
          [payload.project_id || null, toDbDate(payload.accepted_at), payload.order_id]
        );
      } else if (event.event_type === EVENTS.PAYMENT_CHANGED) {
        await connection.query(
          'UPDATE orders SET received_amount = ? WHERE id = ?',
          [Number(payload.total_received || 0), payload.order_id]
        );
      } else if (event.event_type === EVENTS.APPROVAL_DECIDED) {
        await applyProductChange(connection, payload);
      }
      return null;
    });
    ctx.body = { ok: true, duplicate: result.duplicate };
  },
};
