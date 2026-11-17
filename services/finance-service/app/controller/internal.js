'use strict';

const { consumeInbox } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function toDbDate(value) {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

module.exports = {
  async events(ctx) {
    const event = ctx.request.body || {};
    if (!event.event_id || !event.event_type) ctx.throw(400, 'invalid_event');
    const payload = event.payload || {};
    const result = await consumeInbox(ctx.app.db, event, async (connection) => {
      if (event.event_type === EVENTS.ORDER_CONVERTED) {
        const amount = Number(payload.amount || 0);
        const rate = payload.commission_rate === undefined || payload.commission_rate === null
          ? 0.03 : Number(payload.commission_rate);
        const commissionAmount = round2(amount * rate);
        const depositAmount = round2(amount * 0.5);
        const [configRows] = await connection.query('SELECT remaining_rate FROM compensation_config WHERE id = 1');
        const remainingRate = configRows.length ? Number(configRows[0].remaining_rate) : 0.7;
        const depositCommission = round2(commissionAmount * (1 - remainingRate));
        await connection.query(
          `INSERT IGNORE INTO order_ledger
           (order_id, order_no, deal_date, customer_id, customer_name, customer_phone, customer_type,
            order_type, product_config, discount_approver, salesperson_id, salesperson_name,
            order_amount, deposit_amount, deposit_received, balance_amount, balance_received,
            received_amount, outstanding, commission_rate, commission_amount, deposit_commission,
            settlement_commission, paid_commission, referral_flag, referral_name, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [Number(payload.order_id), payload.order_no, toDbDate(payload.deal_date), Number(payload.customer_id),
            payload.customer_name, payload.customer_phone || null, payload.customer_type || null,
            payload.order_type || null, payload.product_config || null, payload.discount_approver || null,
            payload.salesperson_id ? Number(payload.salesperson_id) : null, payload.salesperson_name || null,
            amount, depositAmount, 0, round2(amount - depositAmount), 0,
            0, amount, rate, commissionAmount, depositCommission,
            round2(commissionAmount - depositCommission), 0, payload.referral ? 1 : 0,
            payload.referral_name || null, 'initializing']
        );
      } else if (event.event_type === EVENTS.PROJECT_ACCEPTED) {
        const acceptedAt = toDbDate(payload.accepted_at);
        await connection.query(
          "UPDATE order_ledger SET status = 'accepted', accepted_at = ?, delivery_date = DATE(?) WHERE order_id = ?",
          [acceptedAt, acceptedAt, payload.order_id]
        );
      } else if (event.event_type === EVENTS.SURVEY_REVIEWED) {
        await connection.query(
          `INSERT IGNORE INTO survey_records
           (survey_id, customer_id, customer_name, salesperson_id, salesperson_name, address,
            photo_refs, confirm_method, requirement_summary, is_valid, note, survey_date)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [Number(payload.survey_id), payload.customer_id ? Number(payload.customer_id) : null,
            payload.customer_name || null, payload.salesperson_id ? Number(payload.salesperson_id) : null,
            payload.salesperson_name || null, payload.address || null,
            payload.photo_refs || null, payload.confirm_method || null, payload.requirement_summary || null,
            payload.is_valid ? 1 : 0, payload.note || null, toDbDate(payload.survey_date)]
        );
      } else if (event.event_type === EVENTS.USER_CHANGED) {
        if (payload.user_id) {
          await connection.query('UPDATE order_ledger SET salesperson_name = ? WHERE salesperson_id = ?',
            [payload.name || null, Number(payload.user_id)]);
          await connection.query('UPDATE settlements SET user_name = ? WHERE user_id = ?',
            [payload.name || null, Number(payload.user_id)]);
        }
      }
      return null;
    });
    ctx.body = { ok: true, duplicate: result.duplicate };
  },
};
