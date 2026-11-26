'use strict';

const { withTransaction } = require('../common/db');
const { nextCode, dayPeriod } = require('../common/codes');
const { record } = require('../common/audit');
const {
  badRequest, notFound, fail, money, qty, str, pageParams, paged,
} = require('../common/http');
const { storeFilter, assertStore, isAdmin } = require('../common/scope');
const projectService = require('../project/service');
const financeService = require('../finance/service');

async function listOrders(db, query, user) {
  const { page, pageSize, offset } = pageParams(query);
  const filter = storeFilter(user, 'o.store_id');
  const where = [];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  if (query.status) { where.push('o.status = ?'); params.push(query.status); }
  if (query.keyword) {
    where.push('(o.order_no LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ?)');
    const like = `%${query.keyword}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM sales_orders o ${clause}`, params);
  const [items] = await db.query(
    `SELECT o.*, s.name AS store_name, p.project_no, p.id AS project_id, p.status AS project_status
     FROM sales_orders o
     LEFT JOIN stores s ON s.id = o.store_id
     LEFT JOIN projects p ON p.sales_order_id = o.id
     ${clause} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return paged(items, total, page, pageSize);
}

async function getOrder(db, id, user) {
  const [rows] = await db.query(
    `SELECT o.*, s.name AS store_name FROM sales_orders o
     LEFT JOIN stores s ON s.id = o.store_id WHERE o.id = ? LIMIT 1`, [id]
  );
  if (!rows.length) notFound('sales_order_not_found');
  assertStore(user, rows[0].store_id);
  const [items] = await db.query('SELECT * FROM sales_order_items WHERE order_id = ? ORDER BY id', [id]);
  const [projects] = await db.query('SELECT id, project_no, status FROM projects WHERE sales_order_id = ? LIMIT 1', [id]);
  return { ...rows[0], items, project: projects[0] || null };
}

/**
 * 核心链路起点：门店开单 → 生成光伏项目工单 → 定金收款。
 */
async function createOrder(db, payload, user) {
  const storeId = isAdmin(user) && payload.store_id ? Number(payload.store_id) : user.store_id;
  if (!storeId) badRequest('store_required');

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) badRequest('order_items_required');
  const productIds = [...new Set(items.map((item) => Number(item.product_id)).filter(Boolean))];
  if (!productIds.length) badRequest('order_items_required');
  const [products] = await db.query(
    `SELECT * FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`, productIds
  );
  const productMap = new Map(products.map((product) => [Number(product.id), product]));

  const lines = items.map((item) => {
    const product = productMap.get(Number(item.product_id));
    if (!product) badRequest('product_not_found');
    const amount = qty(item.qty);
    const unitPrice = item.unit_price === undefined || item.unit_price === null
      ? Number(product.sale_price) : money(item.unit_price, 0);
    return {
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      unit: product.unit,
      qty: amount,
      unit_price: unitPrice,
      amount: Math.round(amount * unitPrice * 100) / 100,
    };
  });
  const totalAmount = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
  const depositAmount = money(payload.deposit_amount, 0);
  if (depositAmount > totalAmount) badRequest('deposit_exceeds_total');

  return withTransaction(db, async (conn) => {
    let customerId = payload.customer_id ? Number(payload.customer_id) : null;
    if (customerId) {
      const [customers] = await conn.query('SELECT * FROM customers WHERE id = ? LIMIT 1', [customerId]);
      if (!customers.length) badRequest('customer_not_found');
    } else {
      const customer = await projectService.createCustomer(conn, {
        store_id: storeId,
        name: payload.customer_name,
        phone: payload.customer_phone,
        email: payload.customer_email,
        address: payload.customer_address,
        source: 'store',
      }, { id: user.id, name: user.name, store_id: storeId });
      customerId = customer.id;
    }

    const orderNo = await nextCode(conn, 'sales_order', 'SO', { period: dayPeriod(), separator: '-', width: 4 });
    const [inserted] = await conn.query(
      `INSERT INTO sales_orders
       (order_no, store_id, customer_id, customer_name, customer_phone, customer_address,
        total_amount, deposit_amount, status, remark, created_by, created_by_name)
       VALUES (?,?,?,?,?,?,?,?,'draft',?,?,?)`,
      [orderNo, storeId, customerId, str(payload.customer_name, { required: true, max: 120, field: 'customer_name' }),
        str(payload.customer_phone, { max: 40 }), str(payload.customer_address, { max: 255 }),
        totalAmount, depositAmount, str(payload.remark, { max: 500 }), user.id, user.name]
    );
    for (const line of lines) {
      await conn.query(
        `INSERT INTO sales_order_items (order_id, product_id, product_code, product_name, unit, qty, unit_price, amount)
         VALUES (?,?,?,?,?,?,?,?)`,
        [inserted.insertId, line.product_id, line.product_code, line.product_name,
          line.unit, line.qty, line.unit_price, line.amount]
      );
    }

    const project = await projectService.createFromOrder(conn, {
      sales_order_id: inserted.insertId,
      order_no: orderNo,
      store_id: storeId,
      customer_id: customerId,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      customer_address: payload.customer_address,
      capacity_kw: payload.capacity_kw,
      system_type: payload.system_type,
      sales_user_id: user.id,
      sales_user_name: user.name,
      created_by: user.id,
      remark: payload.remark,
      actor: { id: user.id, name: user.name },
    });

    let deposit = null;
    if (depositAmount > 0) {
      deposit = await financeService.createDepositReceipt(conn, {
        projectId: project.id,
        salesOrderId: inserted.insertId,
        storeId,
        amount: depositAmount,
        method: payload.deposit_method,
        remark: '销售单定金',
        user,
      });
      await conn.query('UPDATE sales_orders SET paid_amount = ? WHERE id = ?', [depositAmount, inserted.insertId]);
    }

    await record(conn, {
      module: 'sales', entity: 'sales_order', entityId: inserted.insertId, action: 'create',
      actor: { id: user.id, name: user.name },
      after: { order_no: orderNo, total_amount: totalAmount, deposit_amount: depositAmount, project_no: project.project_no },
    });

    return {
      id: inserted.insertId,
      order_no: orderNo,
      total_amount: totalAmount,
      deposit_amount: depositAmount,
      deposit_receipt_no: deposit ? deposit.receipt_no : null,
      project_id: project.id,
      project_no: project.project_no,
    };
  });
}

async function confirmOrder(db, id, user) {
  const [rows] = await db.query('SELECT * FROM sales_orders WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) notFound('sales_order_not_found');
  assertStore(user, rows[0].store_id);
  if (rows[0].status !== 'draft') fail('order_not_draft', 409);
  return withTransaction(db, async (conn) => {
    await conn.query("UPDATE sales_orders SET status = 'confirmed', confirmed_by = ?, confirmed_at = NOW() WHERE id = ?", [user.id, id]);
    await record(conn, {
      module: 'sales', entity: 'sales_order', entityId: id, action: 'confirm',
      actor: { id: user.id, name: user.name }, before: { status: 'draft' }, after: { status: 'confirmed' },
    });
    return { id: Number(id), status: 'confirmed' };
  });
}

async function cancelOrder(db, id, user) {
  const [rows] = await db.query('SELECT * FROM sales_orders WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) notFound('sales_order_not_found');
  assertStore(user, rows[0].store_id);
  if (!['draft', 'confirmed'].includes(rows[0].status)) fail('order_not_cancellable', 409);
  return withTransaction(db, async (conn) => {
    await conn.query("UPDATE sales_orders SET status = 'cancelled' WHERE id = ?", [id]);
    await record(conn, {
      module: 'sales', entity: 'sales_order', entityId: id, action: 'cancel',
      actor: { id: user.id, name: user.name }, before: { status: rows[0].status }, after: { status: 'cancelled' },
    });
    return { id: Number(id), status: 'cancelled' };
  });
}

async function todaySummary(db, user) {
  const filter = storeFilter(user, 'store_id');
  const where = ['DATE(created_at) = CURDATE()'];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount FROM sales_orders
     WHERE ${where.join(' AND ')}`, params
  );
  return { count: Number(row.count), amount: Number(row.amount) };
}

module.exports = { listOrders, getOrder, createOrder, confirmOrder, cancelOrder, todaySummary };
