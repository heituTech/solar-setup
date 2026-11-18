'use strict';

const crypto = require('crypto');
const { withTransaction, enqueueEvent } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');
const { salesScopeFor, scopeClause, num, parseJson } = require('../../lib/scope');

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items.map((item) => ({
    name: String(item.name || '').trim(),
    qty: Number(item.qty || 1),
    unit_price: Number(item.unit_price || 0),
  })).filter((item) => item.name);
}

function totalOf(items) {
  return Math.round(items.reduce((sum, item) => sum + item.qty * item.unit_price, 0) * 100) / 100;
}

function rateForAmount(amount) {
  if (amount < 1500) return { order_type: 'retail', rate: 0.08 };
  if (amount <= 5000) return { order_type: 'engineering', rate: 0.04 };
  if (amount <= 15000) return { order_type: 'engineering', rate: 0.05 };
  return { order_type: 'engineering', rate: 0.06 };
}

function toQuote(row) {
  const items = parseJson(row.items, []);
  return {
    ...row,
    id: Number(row.id),
    customer_id: Number(row.customer_id),
    salesperson_id: Number(row.salesperson_id),
    items,
    total_amount: num(row.total_amount),
    system_total: row.system_total === null ? null : num(row.system_total),
    suggested_price: row.suggested_price === null ? null : num(row.suggested_price),
  };
}

// 校验：建议报价 ≠ 系统总造价时必须填差异原因
function assertSuggestedPrice(systemTotal, suggestedPrice, diffReason) {
  if (suggestedPrice === null || suggestedPrice === undefined) return;
  if (systemTotal === null || systemTotal === undefined) return;
  if (Math.abs(Number(suggestedPrice) - Number(systemTotal)) > 0.001 && !String(diffReason || '').trim()) {
    const err = new Error('diff_reason_required');
    err.status = 400;
    throw err;
  }
}

function reference(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

module.exports = {
  async list(ctx) {
    const params = [];
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    let where = `FROM quotes q
                 LEFT JOIN customers c ON c.id = q.customer_id WHERE 1 = 1`;
    where += scopeClause('q.salesperson_id', salesScopeFor(ctx.state.user), params);
    if (ctx.query.status) { where += ' AND q.status = ?'; params.push(String(ctx.query.status)); }
    if (ctx.query.customer_id) { where += ' AND q.customer_id = ?'; params.push(Number(ctx.query.customer_id)); }
    if (q) { where += ' AND (q.quote_no LIKE ? OR c.name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const [countRows] = await ctx.app.db.query(`SELECT COUNT(*) AS total ${where}`, params);
    const [rows] = await ctx.app.db.query(
      `SELECT q.*, c.name AS customer_name ${where} ORDER BY q.id DESC LIMIT ? OFFSET ?`,
      params.concat([pageSize, (page - 1) * pageSize])
    );
    ctx.body = { quotes: rows.map(toQuote), total: Number(countRows[0].total), page, page_size: pageSize };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const items = normalizeItems(body.items);
    if (!items) ctx.throw(400, 'items_required');
    const customerId = Number(body.customer_id);
    const [customers] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customers.length) ctx.throw(404, 'customer_not_found');
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(customers[0].owner_id))) ctx.throw(403, 'forbidden');
    assertSuggestedPrice(body.system_total, body.suggested_price, body.diff_reason);
    const [result] = await ctx.app.db.query(
      `INSERT INTO quotes (quote_no, customer_id, salesperson_id, status, currency, items, total_amount, notes,
        system_total, suggested_price, diff_reason)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [reference('Q'), customerId, Number(ctx.state.user.id), 'draft', body.currency || 'USD',
        JSON.stringify(items), totalOf(items), body.notes || null,
        body.system_total ?? null, body.suggested_price ?? null, body.diff_reason || null]
    );
    const [rows] = await ctx.app.db.query('SELECT * FROM quotes WHERE id = ?', [result.insertId]);
    ctx.status = 201;
    ctx.body = { quote: toQuote(rows[0]) };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM quotes WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'quote_not_found');
    const quote = rows[0];
    if (quote.status !== 'draft') ctx.throw(409, 'quote_not_draft');
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(quote.salesperson_id))) ctx.throw(403, 'forbidden');
    const body = ctx.request.body || {};
    const items = body.items !== undefined ? normalizeItems(body.items) : parseJson(quote.items, []);
    if (!items) ctx.throw(400, 'items_required');
    const systemTotal = body.system_total !== undefined ? body.system_total : quote.system_total;
    const suggestedPrice = body.suggested_price !== undefined ? body.suggested_price : quote.suggested_price;
    const diffReason = body.diff_reason !== undefined ? body.diff_reason : quote.diff_reason;
    assertSuggestedPrice(systemTotal, suggestedPrice, diffReason);
    await ctx.app.db.query(
      `UPDATE quotes SET items = ?, total_amount = ?, notes = ?, currency = ?,
        system_total = ?, suggested_price = ?, diff_reason = ? WHERE id = ?`,
      [JSON.stringify(items), totalOf(items), body.notes !== undefined ? body.notes : quote.notes,
        body.currency || quote.currency, systemTotal, suggestedPrice, diffReason, id]
    );
    const [fresh] = await ctx.app.db.query('SELECT * FROM quotes WHERE id = ?', [id]);
    ctx.body = { quote: toQuote(fresh[0]) };
  },

  async submit(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM quotes WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'quote_not_found');
    if (rows[0].status !== 'draft') ctx.throw(409, 'quote_not_draft');
    await ctx.app.db.query("UPDATE quotes SET status = 'pending_review' WHERE id = ?", [id]);
    ctx.body = { id, status: 'pending_review' };
  },

  async approve(ctx) {
    const id = Number(ctx.params.id);
    const decision = String((ctx.request.body || {}).decision || '');
    if (!['approved', 'rejected'].includes(decision)) ctx.throw(400, 'invalid_decision');
    const [rows] = await ctx.app.db.query('SELECT * FROM quotes WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'quote_not_found');
    if (rows[0].status !== 'pending_review') ctx.throw(409, 'quote_not_pending_review');
    await ctx.app.db.query('UPDATE quotes SET status = ? WHERE id = ?', [decision, id]);
    ctx.body = { id, status: decision };
  },

  async accept(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM quotes WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'quote_not_found');
    if (rows[0].status !== 'approved') ctx.throw(409, 'quote_not_approved');
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(rows[0].salesperson_id))) ctx.throw(403, 'forbidden');
    await ctx.app.db.query("UPDATE quotes SET status = 'accepted' WHERE id = ?", [id]);
    ctx.body = { id, status: 'accepted' };
  },

  async convert(ctx) {
    const id = Number(ctx.params.id);
    const order = await withTransaction(ctx.app.db, async (connection) => {
      const [rows] = await connection.query('SELECT * FROM quotes WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) ctx.throw(404, 'quote_not_found');
      const quote = rows[0];
      if (quote.status !== 'accepted') ctx.throw(409, 'quote_not_accepted');
      const [customers] = await connection.query('SELECT * FROM customers WHERE id = ?', [quote.customer_id]);
      if (!customers.length) ctx.throw(404, 'customer_not_found');
      const customer = customers[0];
      const amount = num(quote.total_amount);
      const items = parseJson(quote.items, []);
      const band = rateForAmount(amount);
      const referral = customer.source === 'referral';
      const rate = referral ? 0 : band.rate;
      const productConfig = items.map((item) => `${item.name}×${item.qty || 1}`).join('; ');
      const orderNo = reference('SO');
      const [result] = await connection.query(
        `INSERT INTO orders (order_no, quote_id, customer_id, customer_name, address, salesperson_id, salesperson_name, amount, commission_rate, status)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [orderNo, id, Number(customer.id), customer.name, customer.address, Number(quote.salesperson_id),
          customer.owner_name || null, amount, rate, 'initializing']
      );
      await connection.query("UPDATE quotes SET status = 'converted' WHERE id = ?", [id]);
      await connection.query("UPDATE customers SET status = 'won' WHERE id = ?", [customer.id]);
      await enqueueEvent(connection, {
        type: EVENTS.ORDER_CONVERTED,
        aggregateId: result.insertId,
        customerId: Number(customer.id),
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['delivery', 'finance'],
        payload: {
          order_id: Number(result.insertId),
          order_no: orderNo,
          quote_id: id,
          customer_id: Number(customer.id),
          customer_name: customer.name,
          customer_phone: customer.phone || null,
          customer_type: customer.customer_type || 'retail',
          order_type: band.order_type,
          product_config: productConfig || null,
          discount_approver: quote.notes || null,
          address: customer.address,
          salesperson_id: Number(quote.salesperson_id),
          salesperson_name: customer.owner_name || null,
          amount,
          commission_rate: rate,
          referral,
          referral_name: referral ? (customer.note || customer.name) : null,
          deal_date: new Date().toISOString().slice(0, 10),
          items,
        },
      });
      const [created] = await connection.query('SELECT * FROM orders WHERE id = ?', [result.insertId]);
      const row = created[0];
      return {
        ...row,
        id: Number(row.id),
        customer_id: Number(row.customer_id),
        salesperson_id: Number(row.salesperson_id),
        amount: num(row.amount),
        received_amount: num(row.received_amount),
        commission_rate: num(row.commission_rate),
      };
    });
    ctx.status = 201;
    ctx.body = { order };
  },
};
