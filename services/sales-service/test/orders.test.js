'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mockDb, mockCtx, expectThrow } = require('./helper');
const orders = require('../app/controller/orders');

const adminUser = { id: 83, role: 'super_admin', name: 'Super Admin' };

const configItems = JSON.stringify([
  { product_id: 3, name: '单晶硅光伏板 550W', qty: 10, unit_price: 105, subtotal: 1050 },
  { product_id: 4, name: '并网逆变器 5kW', qty: 1, unit_price: 680, subtotal: 680 },
  { product_id: 9, name: '屋顶支架（每 kW）', qty: 5, unit_price: 45, subtotal: 225 },
]);

const surveyProduct = { id: 1, category: 'survey_service', model: 'SURVEY-001', name: '现场踏勘服务', price: 150, unit: '次', status: 'active' };

function buildDbForCreateFromConfig({ orderId = 1, itemsSubtotal = 1955, ownerId = 83 } = {}) {
  const insertedItems = [];
  let recalcTotal = 0;
  let orderInsertParams = null;
  const db = mockDb([
    { match: 'SELECT * FROM customers WHERE id = ?', return: [{ id: 1, name: 'X Cafe', owner_id: ownerId, address: 'Boeng Tuk' }] },
    { match: 'SELECT * FROM system_configs WHERE id = ?', return: [{ id: 2, scenario_id: 1, items: configItems, reference_total: itemsSubtotal }] },
    { match: "category = 'survey_service'", return: [surveyProduct] },
    { match: 'INSERT INTO orders', return: (params) => { orderInsertParams = params; return { insertId: orderId }; } },
    { match: 'INSERT INTO order_items', return: (params, sql) => {
      // 根据 SQL 区分 product / survey_service / construction 三种列布局
      let item;
      if (sql.includes('system_config_id')) {
        // product: (order_id, system_config_id, item_type, product_id, name, qty, unit_price, subtotal)
        item = { order_id: params[0], item_type: params[2], product_id: params[3] || null,
          name: params[4], qty: Number(params[5]), unit_price: Number(params[6]), subtotal: Number(params[7]) };
      } else if (sql.includes("'construction'")) {
        // construction: (order_id, item_type, name, qty, unit_price, subtotal, notes) VALUES (?,'construction','施工费用',1,0,0,...)
        item = { order_id: params[0], item_type: 'construction', product_id: null,
          name: '施工费用', qty: 1, unit_price: 0, subtotal: 0 };
      } else {
        // survey_service: (order_id, item_type, product_id, name, qty, unit_price, subtotal) VALUES (?,?,?,?,1,?,?)
        item = { order_id: params[0], item_type: params[1], product_id: params[2] || null,
          name: params[3], qty: 1, unit_price: Number(params[4]), subtotal: Number(params[5]) };
      }
      insertedItems.push(item);
      return { insertId: insertedItems.length };
    } },
    // recalcOrderAmount: SUM
    { match: /SELECT COALESCE\(SUM\(subtotal\).*order_items WHERE order_id = \?/, return: (params) => {
      const total = insertedItems.filter(i => i.order_id === params[0]).reduce((s, i) => s + i.subtotal, 0);
      recalcTotal = total;
      return [{ total }];
    } },
    { match: 'UPDATE orders SET amount = ? WHERE id = ?', return: [{ affectedRows: 1 }] },
    { match: 'SELECT * FROM orders WHERE id = ?', return: (params) => [{
      id: params[0], order_no: 'ORD-TEST', customer_id: 1, customer_name: 'X Cafe', address: 'Boeng Tuk',
      salesperson_id: orderInsertParams ? orderInsertParams[4] : ownerId, amount: recalcTotal, received_amount: 0, commission_rate: 0.03, status: 'initializing',
      project_id: null, quote_id: null, accepted_at: null, created_at: '2026-01-01', updated_at: '2026-01-01',
    }] },
    { match: 'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC', return: (params) => {
      return insertedItems.filter(i => i.order_id === params[0]).map((it, idx) => ({
        id: idx + 1, ...it, created_at: '2026-01-01', notes: null, system_config_id: it.item_type === 'product' ? 2 : null,
      }));
    } },
  ]);
  return { db, insertedItems, getOrderSalespersonId: () => orderInsertParams ? orderInsertParams[4] : null };
}

test('orders.createFromConfig - 缺少参数抛 400', async () => {
  const db = mockDb([]);
  const ctx = mockCtx({ user: adminUser, db, body: {} });
  await expectThrow(() => orders.createFromConfig(ctx), 400, 'missing_params');
});

test('orders.createFromConfig - 客户不存在抛 404', async () => {
  const db = mockDb([{ match: 'SELECT * FROM customers', return: [] }]);
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 999, system_config_id: 2 } });
  await expectThrow(() => orders.createFromConfig(ctx), 404, 'customer_not_found');
});

test('orders.createFromConfig - 配置不存在抛 404', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM customers', return: [{ id: 1, owner_id: 83 }] },
    { match: 'SELECT * FROM system_configs', return: [] },
  ]);
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 1, system_config_id: 999 } });
  await expectThrow(() => orders.createFromConfig(ctx), 404, 'config_not_found');
});

test('orders.createFromConfig - 成功创建含产品+踏勘服务+施工费用行', async () => {
  const { db, insertedItems } = buildDbForCreateFromConfig();
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 1, system_config_id: 2 } });
  await orders.createFromConfig(ctx);

  assert.equal(ctx.status, 201);
  // 3 产品 + 1 踏勘服务 + 1 施工费用 = 5 项
  assert.equal(insertedItems.length, 5);

  const productItems = insertedItems.filter(i => i.item_type === 'product');
  assert.equal(productItems.length, 3);

  const surveyItem = insertedItems.find(i => i.item_type === 'survey_service');
  assert.ok(surveyItem, '应包含踏勘服务行');
  assert.equal(surveyItem.name, '现场踏勘服务');
  assert.equal(surveyItem.unit_price, 150);
  assert.equal(surveyItem.subtotal, 150);

  const constructionItem = insertedItems.find(i => i.item_type === 'construction');
  assert.ok(constructionItem, '应包含施工费用行');
  assert.equal(constructionItem.unit_price, 0);
  assert.equal(constructionItem.subtotal, 0);

  // 总额 = 1050 + 680 + 225 + 150 + 0 = 2105
  assert.equal(ctx.body.order.amount, 2105);
});

test('orders.createFromConfig - 默认归属人=客户owner_id，而非当前操作人', async () => {
  // 客户归属人是 80，当前操作人是 83，订单应挂到 80 名下
  const { db, getOrderSalespersonId } = buildDbForCreateFromConfig({ ownerId: 80 });
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 1, system_config_id: 2 } });
  await orders.createFromConfig(ctx);
  assert.equal(getOrderSalespersonId(), 80);
  assert.equal(ctx.body.order.salesperson_id, 80);
});

test('orders.createFromConfig - 传 salesperson_id 时覆盖客户归属人', async () => {
  const { db, getOrderSalespersonId } = buildDbForCreateFromConfig({ ownerId: 80 });
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 1, system_config_id: 2, salesperson_id: 91 } });
  await orders.createFromConfig(ctx);
  assert.equal(getOrderSalespersonId(), 91);
  assert.equal(ctx.body.order.salesperson_id, 91);
});

test('orders.createFromConfig - salesperson_id=0 时回退到客户归属人', async () => {
  const { db, getOrderSalespersonId } = buildDbForCreateFromConfig({ ownerId: 80 });
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 1, system_config_id: 2, salesperson_id: 0 } });
  await orders.createFromConfig(ctx);
  assert.equal(getOrderSalespersonId(), 80);
});

test('orders.createFromConfig - salesperson_id 为负数时回退到客户归属人', async () => {
  const { db, getOrderSalespersonId } = buildDbForCreateFromConfig({ ownerId: 80 });
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 1, system_config_id: 2, salesperson_id: -1 } });
  await orders.createFromConfig(ctx);
  assert.equal(getOrderSalespersonId(), 80);
});

test('orders.createFromConfig - salesperson_id 为字符串数字时转换为数值', async () => {
  const { db, getOrderSalespersonId } = buildDbForCreateFromConfig({ ownerId: 80 });
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 1, system_config_id: 2, salesperson_id: '91' } });
  await orders.createFromConfig(ctx);
  assert.equal(getOrderSalespersonId(), 91);
});

test('orders.createFromConfig - 无踏勘服务产品时仅生成产品+施工费用', async () => {
  const insertedItems = [];
  let recalcTotal = 0;
  const db = mockDb([
    { match: 'SELECT * FROM customers', return: [{ id: 1, name: 'X Cafe', owner_id: 83, address: 'Boeng Tuk' }] },
    { match: 'SELECT * FROM system_configs', return: [{ id: 2, items: configItems }] },
    { match: "category = 'survey_service'", return: [] },
    { match: 'INSERT INTO orders', return: { insertId: 1 } },
    { match: 'INSERT INTO order_items', return: (params, sql) => {
      if (sql.includes("'construction'")) {
        insertedItems.push({ order_id: params[0], item_type: 'construction', name: '施工费用', unit_price: 0, subtotal: 0 });
      } else {
        insertedItems.push({ order_id: params[0], item_type: params[2], name: params[4], unit_price: Number(params[6]), subtotal: Number(params[7]) });
      }
      return { insertId: insertedItems.length };
    } },
    { match: /SELECT COALESCE\(SUM\(subtotal\)/, return: () => {
      recalcTotal = insertedItems.reduce((s, i) => s + i.subtotal, 0);
      return [{ total: recalcTotal }];
    } },
    { match: 'UPDATE orders SET amount', return: [{ affectedRows: 1 }] },
    { match: 'SELECT * FROM orders WHERE id', return: [{ id: 1, order_no: 'ORD-T', customer_id: 1, customer_name: 'X Cafe', address: null, salesperson_id: 83, amount: 1955, received_amount: 0, commission_rate: 0.03, status: 'initializing', project_id: null, quote_id: null, accepted_at: null, created_at: '2026-01-01', updated_at: '2026-01-01' }] },
    { match: 'SELECT * FROM order_items WHERE order_id', return: [] },
  ]);
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 1, system_config_id: 2 } });
  await orders.createFromConfig(ctx);
  const surveyItem = insertedItems.find(i => i.item_type === 'survey_service');
  assert.equal(surveyItem, undefined, '无踏勘服务产品时不应生成踏勘行');
  // 1955 + 0 = 1955
  assert.equal(recalcTotal, 1955);
});

// ===================== updateItem =====================

test('orders.updateItem - 更新数量并重算 subtotal 与订单总额', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM orders WHERE id = ?', return: [{ id: 1, salesperson_id: 83 }] },
    { match: 'SELECT * FROM order_items WHERE id = ? AND order_id = ?', return: [{ id: 5, order_id: 1, item_type: 'product', qty: 10, unit_price: 105, subtotal: 1050 }] },
    { match: 'UPDATE order_items SET', return: [{ affectedRows: 1 }] },
    { match: /SELECT COALESCE\(SUM\(subtotal\)/, return: [{ total: 1575 }] },
    { match: 'UPDATE orders SET amount', return: [{ affectedRows: 1 }] },
    { match: 'SELECT * FROM order_items WHERE id = ?', return: (params) => [{ id: params[0], order_id: 1, item_type: 'product', qty: 15, unit_price: 105, subtotal: 1575 }] },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1, itemId: 5 }, db, body: { qty: 15 } });
  await orders.updateItem(ctx);
  // 15 * 105 = 1575
  assert.equal(ctx.body.item.qty, 15);
  assert.equal(ctx.body.item.subtotal, 1575);
});

test('orders.updateItem - 无可更新字段抛 400', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM orders WHERE id = ?', return: [{ id: 1, salesperson_id: 83 }] },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1, itemId: 5 }, db, body: {} });
  await expectThrow(() => orders.updateItem(ctx), 400, 'nothing_to_update');
});

test('orders.updateItem - 订单不存在抛 404', async () => {
  const db = mockDb([{ match: 'SELECT * FROM orders WHERE id = ?', return: [] }]);
  const ctx = mockCtx({ user: adminUser, params: { id: 999, itemId: 5 }, db, body: { qty: 2 } });
  await expectThrow(() => orders.updateItem(ctx), 404, 'order_not_found');
});

// ===================== removeItem =====================

test('orders.removeItem - 删除订单项并重算总额', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM orders WHERE id = ?', return: [{ id: 1, salesperson_id: 83 }] },
    { match: 'DELETE FROM order_items', return: [{ affectedRows: 1 }] },
    { match: /SELECT COALESCE\(SUM\(subtotal\)/, return: [{ total: 1055 }] },
    { match: 'UPDATE orders SET amount', return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1, itemId: 5 }, db });
  await orders.removeItem(ctx);
  assert.deepEqual(ctx.body, { id: 5, deleted: true });
});
