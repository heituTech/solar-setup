'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mockDb, mockCtx, expectThrow } = require('./helper');
const surveys = require('../app/controller/surveys');

const adminUser = { id: 83, role: 'super_admin', name: 'Super Admin' };
const engineerUser = { id: 90, role: 'electrical_engineer', name: 'Engineer' };
const managerUser = { id: 70, role: 'sales_manager', name: 'Sales Manager' };

const times = { departure_at: '2026-11-26 08:00:00', finish_at: '2026-11-26 18:00:00' };

// ===================== create =====================

test('surveys.create - 未关联报价抛 400', async () => {
  const db = mockDb([]);
  const ctx = mockCtx({ user: adminUser, db, body: { ...times } });
  await expectThrow(() => surveys.create(ctx), 400, 'quote_required');
});

test('surveys.create - 报价不存在抛 404', async () => {
  const db = mockDb([{ match: 'SELECT id, customer_id, scenario_id FROM quotes WHERE id = ?', return: [] }]);
  const ctx = mockCtx({ user: adminUser, db, body: { quote_id: 999, ...times } });
  await expectThrow(() => surveys.create(ctx), 404, 'quote_not_found');
});

test('surveys.create - 缺少出发时间抛 400', async () => {
  const db = mockDb([
    { match: 'SELECT id, customer_id, scenario_id FROM quotes WHERE id = ?', return: [{ id: 11, customer_id: 1, scenario_id: 9 }] },
    { match: 'SELECT * FROM customers WHERE id = ?', return: [{ id: 1, owner_id: 83, address: 'A' }] },
  ]);
  const ctx = mockCtx({ user: adminUser, db, body: { quote_id: 11, finish_at: times.finish_at } });
  await expectThrow(() => surveys.create(ctx), 400, 'departure_at_required');
});

test('surveys.create - 完成时间早于出发时间抛 400', async () => {
  const db = mockDb([
    { match: 'SELECT id, customer_id, scenario_id FROM quotes WHERE id = ?', return: [{ id: 11, customer_id: 1, scenario_id: 9 }] },
    { match: 'SELECT * FROM customers WHERE id = ?', return: [{ id: 1, owner_id: 83, address: 'A' }] },
  ]);
  const ctx = mockCtx({
    user: adminUser, db,
    body: { quote_id: 11, departure_at: '2026-11-26 18:00:00', finish_at: '2026-11-26 08:00:00' },
  });
  await expectThrow(() => surveys.create(ctx), 400, 'finish_at_after_departure');
});

test('surveys.create - 客户与场景从报价带出并成功创建', async () => {
  let insertParams = null;
  const db = mockDb([
    { match: 'SELECT id, customer_id, scenario_id FROM quotes WHERE id = ?', return: [{ id: 11, customer_id: 1, scenario_id: 9 }] },
    { match: 'SELECT * FROM customers WHERE id = ?', return: [{ id: 1, owner_id: 83, address: 'Customer address' }] },
    { match: 'INSERT INTO surveys', return: (params) => { insertParams = params; return { insertId: 5 }; } },
    { match: 'SELECT * FROM surveys WHERE id = ?', return: (params) => [{
      id: params[0], customer_id: 1, quote_id: 11, scenario_id: 9, address: 'Customer address',
      roof_type: null, roof_area: null, monthly_consumption: null, construction_cost: null,
      payload: '{}', status: 'draft', created_by: 83, reviewed_by: null, completion_reviewed_by: null,
      engineed_id: null, order_id: null,
    }] },
  ]);
  const ctx = mockCtx({ user: adminUser, db, body: { quote_id: 11, ...times } });
  await surveys.create(ctx);
  assert.equal(ctx.status, 201);
  // params: [customer_id, quote_id, scenario_id, ...]
  assert.equal(insertParams[0], 1);
  assert.equal(insertParams[1], 11);
  assert.equal(insertParams[2], 9);
  assert.equal(ctx.body.survey.quote_id, 11);
});

// ===================== submit =====================

test('surveys.submit - 未关联报价的历史勘测不可申请踏勘', async () => {
  const db = mockDb([{ match: 'SELECT * FROM surveys WHERE id = ?', return: [{
    id: 1, status: 'draft', quote_id: null, created_by: 83, departure_at: times.departure_at, finish_at: times.finish_at,
  }] }]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db });
  await expectThrow(() => surveys.submit(ctx), 400, 'quote_required');
});

test('surveys.submit - 缺少出发/完成时间抛 400', async () => {
  const db = mockDb([{ match: 'SELECT * FROM surveys WHERE id = ?', return: [{
    id: 1, status: 'draft', quote_id: 11, created_by: 83, departure_at: null, finish_at: null,
  }] }]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db });
  await expectThrow(() => surveys.submit(ctx), 400, 'departure_at_required');
});

test('surveys.submit - 成功提交待审核', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM surveys WHERE id = ?', return: [{
      id: 1, status: 'draft', quote_id: 11, created_by: 83, ...times,
    }] },
    { match: "UPDATE surveys SET status = 'submitted'", return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db });
  await surveys.submit(ctx);
  assert.deepEqual(ctx.body, { id: 1, status: 'submitted' });
});

// ===================== review =====================

test('surveys.review - 踏勘申请审核通过', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM surveys WHERE id = ?', return: [{
      id: 1, status: 'submitted', customer_id: 1, quote_id: 11, created_by: 83, created_by_name: 'Sales',
      payload: '{}', created_at: '2026-11-25',
    }] },
    { match: 'SELECT * FROM customers WHERE id = ?', return: [{ id: 1, name: 'X Cafe', address: 'A' }] },
    { match: 'UPDATE surveys SET status', return: [{ affectedRows: 1 }] },
    { match: 'INSERT INTO event_outbox', return: { insertId: 1 } },
  ]);
  const ctx = mockCtx({ user: managerUser, params: { id: 1 }, db, body: { decision: 'valid' } });
  await surveys.review(ctx);
  assert.deepEqual(ctx.body, { id: 1, status: 'reviewed' });
});

test('surveys.review - 完成踏勘审核通过 → completed', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM surveys WHERE id = ?', return: [{ id: 1, status: 'completion_pending', completed_at: null }] },
    { match: 'UPDATE surveys SET status', return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: managerUser, params: { id: 1 }, db, body: { decision: 'valid' } });
  await surveys.review(ctx);
  assert.deepEqual(ctx.body, { id: 1, status: 'completed' });
});

test('surveys.review - 完成踏勘审核驳回 → 回到施工中', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM surveys WHERE id = ?', return: [{ id: 1, status: 'completion_pending', completed_at: null }] },
    { match: 'UPDATE surveys SET status', return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: managerUser, params: { id: 1 }, db, body: { decision: 'invalid' } });
  await surveys.review(ctx);
  assert.deepEqual(ctx.body, { id: 1, status: 'reviewed' });
});

// ===================== assignEngineer =====================

test('surveys.assignEngineer - 缺少工程师抛 400', async () => {
  const db = mockDb([]);
  const ctx = mockCtx({ user: { id: 60, role: 'engineering_manager' }, params: { id: 1 }, db, body: {} });
  await expectThrow(() => surveys.assignEngineer(ctx), 400, 'engineer_required');
});

test('surveys.assignEngineer - 指定电气工程师', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM surveys WHERE id = ?', return: [{ id: 1, status: 'reviewed' }] },
    { match: 'UPDATE surveys SET engineer_id', return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({
    user: { id: 60, role: 'engineering_manager' }, params: { id: 1 }, db,
    body: { engineer_id: 90, engineer_name: 'Engineer' },
  });
  await surveys.assignEngineer(ctx);
  assert.deepEqual(ctx.body, { id: 1, engineer_id: 90, engineer_name: 'Engineer' });
});

// ===================== fillConstructionCost =====================

test('surveys.fillConstructionCost - 非法费用（负数）抛 400', async () => {
  const db = mockDb([]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 1 }, db, body: { construction_cost: -100 } });
  await expectThrow(() => surveys.fillConstructionCost(ctx), 400, 'invalid_construction_cost');
});

test('surveys.fillConstructionCost - 未审核通过不可填写 → 409', async () => {
  const db = mockDb([{ match: 'SELECT * FROM surveys WHERE id = ?', return: [{
    id: 1, status: 'submitted', quote_id: 11, engineer_id: 90,
  }] }]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 1 }, db, body: { construction_cost: 2500 } });
  await expectThrow(() => surveys.fillConstructionCost(ctx), 409, 'survey_not_reviewed');
});

test('surveys.fillConstructionCost - 非指定工程师不可填写 → 403', async () => {
  const db = mockDb([{ match: 'SELECT * FROM surveys WHERE id = ?', return: [{
    id: 1, status: 'reviewed', quote_id: 11, engineer_id: 91,
  }] }]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 1 }, db, body: { construction_cost: 2500 } });
  await expectThrow(() => surveys.fillConstructionCost(ctx), 403, 'forbidden');
});

test('surveys.fillConstructionCost - 写入报价施工费用项并重算总额', async () => {
  const items = [{ name: '光伏组件', qty: 2, unit_price: 1000 }];
  let quoteUpdate = null;
  const db = mockDb([
    { match: 'SELECT * FROM surveys WHERE id = ?', return: [{
      id: 1, status: 'reviewed', quote_id: 11, engineer_id: 90,
    }] },
    { match: 'SELECT id, items FROM quotes WHERE id = ?', return: [{ id: 11, items: JSON.stringify(items) }] },
    { match: 'UPDATE surveys SET construction_cost', return: [{ affectedRows: 1 }] },
    { match: 'UPDATE quotes SET items', return: (params) => { quoteUpdate = params; return [{ affectedRows: 1 }]; } },
  ]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 1 }, db, body: { construction_cost: 500 } });
  await surveys.fillConstructionCost(ctx);

  assert.equal(ctx.body.construction_cost, 500);
  assert.equal(ctx.body.quote_id, 11);
  assert.equal(ctx.body.quote_total, 2500);
  const savedItems = JSON.parse(quoteUpdate[0]);
  const construction = savedItems.find((item) => item.name === '施工费用');
  assert.ok(construction, '应在报价中新增施工费用项');
  assert.equal(construction.unit_price, 500);
  assert.equal(quoteUpdate[1], 2500);
  assert.equal(quoteUpdate[2], 11);
});

// ===================== requestCompletion / resurvey =====================

test('surveys.requestCompletion - 未填写施工费用不可申请完成 → 409', async () => {
  const db = mockDb([{ match: 'SELECT * FROM surveys WHERE id = ?', return: [{
    id: 1, status: 'reviewed', engineer_id: 90, construction_cost: null,
  }] }]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 1 }, db, body: {} });
  await expectThrow(() => surveys.requestCompletion(ctx), 409, 'construction_cost_required');
});

test('surveys.requestCompletion - 踏勘人员申请完成', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM surveys WHERE id = ?', return: [{
      id: 1, status: 'reviewed', engineer_id: 90, construction_cost: '2500.00',
    }] },
    { match: "UPDATE surveys SET status = 'completion_pending'", return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: engineerUser, params: { id: 1 }, db, body: {} });
  await surveys.requestCompletion(ctx);
  assert.deepEqual(ctx.body, { id: 1, status: 'completion_pending' });
});

test('surveys.resurvey - 未完成的踏勘不可申请重新踏勘 → 409', async () => {
  const db = mockDb([{ match: 'SELECT * FROM surveys WHERE id = ?', return: [{ id: 1, status: 'reviewed', quote_id: 11 }] }]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db, body: times });
  await expectThrow(() => surveys.resurvey(ctx), 409, 'survey_not_completed');
});

test('surveys.resurvey - 已完成踏勘可申请重新踏勘并回到待审核', async () => {
  let updateParams = null;
  const db = mockDb([
    { match: 'SELECT * FROM surveys WHERE id = ?', return: [{
      id: 1, status: 'completed', quote_id: 11, created_by: 83,
    }] },
    { match: 'UPDATE surveys SET status', return: (params) => { updateParams = params; return [{ affectedRows: 1 }]; } },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db, body: times });
  await surveys.resurvey(ctx);
  assert.deepEqual(ctx.body, { id: 1, status: 'submitted' });
  assert.equal(updateParams[0], times.departure_at);
  assert.equal(updateParams[1], times.finish_at);
});
