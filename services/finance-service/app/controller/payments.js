'use strict';

const { withTransaction, enqueueEvent } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');
const { num, salesScopeFor, scopeClause } = require('../../lib/finance');

function toPayment(row) {
  return {
    ...row,
    id: Number(row.id),
    order_id: Number(row.order_id),
    amount: num(row.amount),
    salesperson_id: row.salesperson_id ? Number(row.salesperson_id) : null,
  };
}

module.exports = {
  async list(ctx) {
    const params = [];
    let sql = `SELECT p.*, l.order_no, l.customer_name, l.salesperson_id
               FROM payments p LEFT JOIN order_ledger l ON l.order_id = p.order_id WHERE 1 = 1`;
    sql += scopeClause('l.salesperson_id', salesScopeFor(ctx.state.user), params);
    if (ctx.query.order_id) { sql += ' AND p.order_id = ?'; params.push(Number(ctx.query.order_id)); }
    sql += ' ORDER BY p.id DESC LIMIT 300';
    const [rows] = await ctx.app.db.query(sql, params);
    ctx.body = { payments: rows.map(toPayment) };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const orderId = Number(body.order_id);
    const amount = Number(body.amount);
    if (!orderId) ctx.throw(400, 'order_id_required');
    if (!Number.isFinite(amount) || amount <= 0) ctx.throw(400, 'invalid_amount');
    const direction = body.direction === 'refund' ? 'refund' : 'in';
    const [ledgerRows] = await ctx.app.db.query('SELECT * FROM order_ledger WHERE order_id = ?', [orderId]);
    if (!ledgerRows.length) ctx.throw(404, 'order_not_found');
    const paymentId = await withTransaction(ctx.app.db, async (connection) => {
      const [inserted] = await connection.query(
        `INSERT INTO payments (order_id, amount, direction, method, reference, received_at, recorded_by, note)
         VALUES (?,?,?,?,?,?,?,?)`,
        [orderId, amount, direction, body.method || null, body.reference || null,
          body.received_at ? new Date(body.received_at) : new Date(), Number(ctx.state.user.id), body.note || null]
      );
      const [[totals]] = await connection.query(
        "SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS total FROM payments WHERE order_id = ?",
        [orderId]
      );
      const received = num(totals.total);
      const orderAmount = num(ledgerRows[0].order_amount);
      const depositAmount = num(ledgerRows[0].deposit_amount);
      await connection.query(
        `UPDATE order_ledger SET received_amount = ?, outstanding = ?, deposit_received = ?, balance_received = ?
         WHERE order_id = ?`,
        [received, Math.round((orderAmount - received) * 100) / 100,
          depositAmount > 0 && received >= depositAmount ? 1 : 0,
          orderAmount > 0 && received >= orderAmount ? 1 : 0, orderId]
      );
      await enqueueEvent(connection, {
        type: EVENTS.PAYMENT_CHANGED,
        aggregateId: orderId,
        customerId: Number(ledgerRows[0].customer_id),
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales'],
        payload: {
          payment_id: Number(inserted.insertId),
          order_id: orderId,
          amount,
          direction,
          total_received: received,
        },
      });
      return Number(inserted.insertId);
    });
    const [fresh] = await ctx.app.db.query(
      `SELECT p.*, l.order_no, l.customer_name, l.salesperson_id
       FROM payments p LEFT JOIN order_ledger l ON l.order_id = p.order_id WHERE p.id = ?`,
      [paymentId]
    );
    ctx.status = 201;
    ctx.body = { payment: toPayment(fresh[0]) };
  },
};
