'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mockDb, mockCtx, expectThrow } = require('./helper');
const surveys = require('../app/controller/surveys');

const adminUser = { id: 83, role: 'super_admin', name: 'Super Admin' };
const engineerUser = { id: 90, role: 'electrical_engineer', name: 'Engineer' };

// ===================== fillConstructionCost =====================

test('surveys.fillConstructionCost - 非法费用（负数）抛 400', async () => {
  const db = mockDb([]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 1 }, db, body: { construction_cost: -100 } });
  await expectThrow(() => surveys.fillConstructionCost(ctx), 400, 'invalid_construction_cost');
});

test('surveys.fillConstructionCost - 非法费用（非数字）抛 400', async () => {
  const db = mockDb([]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 1 }, db, body: { construction_cost: 'abc' } });
  await expectThrow(() => surveys.fillConstructionCost(ctx), 400, 'invalid_construction_cost');
});

test('surveys.fillConstructionCost - 踏勘单不存在抛 404', async () => {
  const db = mockDb([{ match: 'SELECT * FROM surveys WHERE id = ?', return: [] }]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 999 }, db, body: { construction_cost: 2500 } });
  await expectThrow(() => surveys.fillConstructionCost(ctx), 404, 'survey_not_found');
});

test('surveys.fillConstructionCost - 无关联订单时仅更新 survey', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM surveys WHERE id = ?', return: [{ id: 1, order_id: null }] },
    { match: 'UPDATE surveys SET construction_cost', return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 1 }, db, body: { construction_cost: 2500 } });
  await surveys.fillConstructionCost(ctx);
  assert.deepEqual(ctx.body, { id: 1, construction_cost: 2500, order_id: null });
  // 不应有 order_items 更新
  const hasOrderItemUpdate = db.calls.some(c => c.sql.includes("UPDATE order_items"));
  assert.equal(hasOrderItemUpdate, false);
});

test('surveys.fillConstructionCost - 有关联订单时回填施工费用行并重算订单总额', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM surveys WHERE id = ?', return: [{ id: 1, order_id: 5 }] },
    { match: 'UPDATE surveys SET construction_cost', return: [{ affectedRows: 1 }] },
    { match: "UPDATE order_items SET unit_price", return: [{ affectedRows: 1 }] },
    { match: /SELECT COALESCE\(SUM\(subtotal\)/, return: [{ total: 4605 }] },
    { match: 'UPDATE orders SET amount', return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 1 }, db, body: { construction_cost: 2500 } });
  await surveys.fillConstructionCost(ctx);

  assert.deepEqual(ctx.body, { id: 1, construction_cost: 2500, order_id: 5 });

  // 验证施工费用行被回填
  const orderItemUpdate = db.calls.find(c => c.sql.includes("UPDATE order_items SET unit_price"));
  assert.ok(orderItemUpdate, '应更新 order_items 施工费用行');
  // params: [cost, cost, note, order_id]
  assert.equal(orderItemUpdate.params[0], 2500);
  assert.equal(orderItemUpdate.params[1], 2500);
  assert.equal(orderItemUpdate.params[3], 5);

  // 验证订单总额被重算
  const orderUpdate = db.calls.find(c => c.sql.includes('UPDATE orders SET amount'));
  assert.ok(orderUpdate, '应重算订单总额');
  assert.equal(orderUpdate.params[0], 4605);
});

// ===================== linkOrder =====================

test('surveys.linkOrder - 缺少 order_id 抛 400', async () => {
  const db = mockDb([]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db, body: {} });
  await expectThrow(() => surveys.linkOrder(ctx), 400, 'order_id_required');
});

test('surveys.linkOrder - 踏勘单不存在抛 404', async () => {
  const db = mockDb([{ match: 'SELECT id FROM surveys WHERE id = ?', return: [] }]);
  const ctx = mockCtx({ user: adminUser, params: { id: 999 }, db, body: { order_id: 1 } });
  await expectThrow(() => surveys.linkOrder(ctx), 404, 'survey_not_found');
});

test('surveys.linkOrder - 订单不存在抛 404', async () => {
  const db = mockDb([
    { match: 'SELECT id FROM surveys WHERE id = ?', return: [{ id: 1 }] },
    { match: 'SELECT id FROM orders WHERE id = ?', return: [] },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db, body: { order_id: 999 } });
  await expectThrow(() => surveys.linkOrder(ctx), 404, 'order_not_found');
});

test('surveys.linkOrder - 成功关联', async () => {
  const db = mockDb([
    { match: 'SELECT id FROM surveys WHERE id = ?', return: [{ id: 1 }] },
    { match: 'SELECT id FROM orders WHERE id = ?', return: [{ id: 5 }] },
    { match: 'UPDATE surveys SET order_id', return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db, body: { order_id: 5 } });
  await surveys.linkOrder(ctx);
  assert.deepEqual(ctx.body, { id: 1, order_id: 5 });
});
