'use strict';

const crypto = require('crypto');
const { salesScopeFor, scopeClause, num, parseJson } = require('../../lib/scope');

function newNo(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function toOrder(row) {
  return {
    ...row,
    id: Number(row.id),
    customer_id: Number(row.customer_id),
    salesperson_id: Number(row.salesperson_id),
    project_id: row.project_id ? Number(row.project_id) : null,
    quote_id: row.quote_id ? Number(row.quote_id) : null,
    amount: num(row.amount),
    received_amount: num(row.received_amount),
    outstanding: Math.round((num(row.amount) - num(row.received_amount)) * 100) / 100,
    commission_rate: num(row.commission_rate),
  };
}

function toOrderItem(row) {
  return {
    ...row,
    id: Number(row.id),
    order_id: Number(row.order_id),
    system_config_id: row.system_config_id ? Number(row.system_config_id) : null,
    product_id: row.product_id ? Number(row.product_id) : null,
    qty: num(row.qty),
    unit_price: num(row.unit_price),
    subtotal: num(row.subtotal),
  };
}

async function recalcOrderAmount(db, orderId) {
  const [rows] = await db.query(
    'SELECT COALESCE(SUM(subtotal), 0) AS total FROM order_items WHERE order_id = ?', [orderId]
  );
  const total = Math.round(num(rows[0].total) * 100) / 100;
  await db.query('UPDATE orders SET amount = ? WHERE id = ?', [total, orderId]);
  return total;
}

module.exports = {
  async list(ctx) {
    const params = [];
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    let sql = 'SELECT * FROM orders WHERE 1 = 1';
    sql += scopeClause('salesperson_id', salesScopeFor(ctx.state.user), params);
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(String(ctx.query.status)); }
    if (q) { sql += ' AND (order_no LIKE ? OR customer_name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [countRows] = await ctx.app.db.query(countSql, params);
    const [rows] = await ctx.app.db.query(`${sql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      params.concat([pageSize, (page - 1) * pageSize]));
    ctx.body = { orders: rows.map(toOrder), total: Number(countRows[0].total), page, page_size: pageSize };
  },

  async detail(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'order_not_found');
    const order = toOrder(rows[0]);
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(order.salesperson_id)) ctx.throw(403, 'forbidden');
    const [quotes] = await ctx.app.db.query('SELECT * FROM quotes WHERE id = ?', [order.quote_id || 0]);
    const [items] = await ctx.app.db.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC', [id]);
    ctx.body = { order, quote: quotes[0] || null, items: items.map(toOrderItem) };
  },

  async updateCommission(ctx) {
    const id = Number(ctx.params.id);
    const body = ctx.request.body || {};
    const rate = Number(body.commission_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) ctx.throw(400, 'invalid_commission_rate');
    const [rows] = await ctx.app.db.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'order_not_found');
    if (rows[0].status === 'accepted') ctx.throw(409, 'order_already_accepted');
    await ctx.app.db.query('UPDATE orders SET commission_rate = ? WHERE id = ?', [rate, id]);
    ctx.body = { id, commission_rate: rate };
  },

  // 从系统配置一键生成订单 + 自动加踏勘服务 + 施工费用行
  async createFromConfig(ctx) {
    const body = ctx.request.body || {};
    const customerId = Number(body.customer_id);
    const configId = Number(body.system_config_id);
    if (!customerId || !configId) ctx.throw(400, 'missing_params');

    const [customers] = await ctx.app.db.query('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customers.length) ctx.throw(404, 'customer_not_found');
    const customer = customers[0];
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(customer.owner_id))) ctx.throw(403, 'forbidden');

    const [configs] = await ctx.app.db.query('SELECT * FROM system_configs WHERE id = ?', [configId]);
    if (!configs.length) ctx.throw(404, 'config_not_found');
    const config = configs[0];
    const configItems = parseJson(config.items, []);

    // 查 PDM 里的踏勘服务产品
    const [surveyProducts] = await ctx.app.db.query(
      "SELECT * FROM products WHERE category = 'survey_service' AND status = 'active' LIMIT 1"
    );

    // 订单归属跟随客户归属人（customer.owner_id）；
    // 经理/管理员可通过 salesperson_id 入参显式指定归属人（代下单场景）
    const overrideSalesperson = body.salesperson_id ? Number(body.salesperson_id) : null;
    const salespersonId = overrideSalesperson && overrideSalesperson > 0
      ? overrideSalesperson
      : Number(customer.owner_id);
    // 归属人姓名：默认取客户归属人姓名（冗余字段，避免跨服务查 users）
    const salespersonName = salespersonId === Number(customer.owner_id)
      ? customer.owner_name
      : (body.salesperson_name || null);

    const orderNo = newNo('ORD');
    const [result] = await ctx.app.db.query(
      `INSERT INTO orders (order_no, customer_id, customer_name, address, salesperson_id, salesperson_name, status, amount)
       VALUES (?,?,?,?,?,?,'initializing',0)`,
      [orderNo, customerId, customer.name, customer.address || null, salespersonId, salespersonName]
    );
    const orderId = result.insertId;

    // 1. 配置里的产品项
    for (const it of configItems) {
      await ctx.app.db.query(
        `INSERT INTO order_items (order_id, system_config_id, item_type, product_id, name, qty, unit_price, subtotal)
         VALUES (?,?,?,?,?,?,?,?)`,
        [orderId, configId, 'product', it.product_id || null, it.name,
          num(it.qty), num(it.unit_price), num(it.subtotal)]
      );
    }
    // 2. 默认踏勘服务
    if (surveyProducts.length) {
      const sp = surveyProducts[0];
      await ctx.app.db.query(
        `INSERT INTO order_items (order_id, item_type, product_id, name, qty, unit_price, subtotal)
         VALUES (?,?,?,?,1,?,?)`,
        [orderId, 'survey_service', Number(sp.id), sp.name, num(sp.price), num(sp.price)]
      );
    }
    // 3. 默认施工费用行（金额 0，踏勘后由勘察人员填）
    await ctx.app.db.query(
      `INSERT INTO order_items (order_id, item_type, name, qty, unit_price, subtotal, notes)
       VALUES (?, 'construction', '施工费用', 1, 0, 0, '踏勘后由勘察人员填写')`,
      [orderId]
    );

    const total = await recalcOrderAmount(ctx.app.db, orderId);
    const [orderRows] = await ctx.app.db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    const [items] = await ctx.app.db.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC', [orderId]);
    ctx.status = 201;
    ctx.body = { order: { ...toOrder(orderRows[0]), amount: total }, items: items.map(toOrderItem) };
  },

  // 更新订单项（数量、单价）
  async updateItem(ctx) {
    const orderId = Number(ctx.params.id);
    const itemId = Number(ctx.params.itemId);
    const body = ctx.request.body || {};
    const [orders] = await ctx.app.db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!orders.length) ctx.throw(404, 'order_not_found');
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(orders[0].salesperson_id))) ctx.throw(403, 'forbidden');

    const fields = [];
    const params = [];
    if (body.qty !== undefined) { fields.push('qty = ?'); params.push(num(body.qty)); }
    if (body.unit_price !== undefined) { fields.push('unit_price = ?'); params.push(num(body.unit_price)); }
    if (body.notes !== undefined) { fields.push('notes = ?'); params.push(String(body.notes)); }
    if (!fields.length) ctx.throw(400, 'nothing_to_update');

    // 重算 subtotal
    const [items] = await ctx.app.db.query('SELECT * FROM order_items WHERE id = ? AND order_id = ?', [itemId, orderId]);
    if (!items.length) ctx.throw(404, 'item_not_found');
    const cur = items[0];
    const newQty = body.qty !== undefined ? num(body.qty) : num(cur.qty);
    const newPrice = body.unit_price !== undefined ? num(body.unit_price) : num(cur.unit_price);
    fields.push('subtotal = ?');
    params.push(Math.round(newQty * newPrice * 100) / 100);

    await ctx.app.db.query(`UPDATE order_items SET ${fields.join(', ')} WHERE id = ?`, params.concat([itemId]));
    await recalcOrderAmount(ctx.app.db, orderId);
    const [updated] = await ctx.app.db.query('SELECT * FROM order_items WHERE id = ?', [itemId]);
    ctx.body = { item: toOrderItem(updated[0]) };
  },

  async removeItem(ctx) {
    const orderId = Number(ctx.params.id);
    const itemId = Number(ctx.params.itemId);
    const [orders] = await ctx.app.db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!orders.length) ctx.throw(404, 'order_not_found');
    const scope = salesScopeFor(ctx.state.user);
    if (scope !== null && !scope.includes(Number(orders[0].salesperson_id))) ctx.throw(403, 'forbidden');
    await ctx.app.db.query('DELETE FROM order_items WHERE id = ? AND order_id = ?', [itemId, orderId]);
    await recalcOrderAmount(ctx.app.db, orderId);
    ctx.body = { id: itemId, deleted: true };
  },
};
