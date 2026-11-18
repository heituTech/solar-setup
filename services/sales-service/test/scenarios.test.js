'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mockDb, mockCtx, expectThrow } = require('./helper');
const scenarios = require('../app/controller/scenarios');

const adminUser = { id: 83, role: 'super_admin', name: 'Super Admin' };

function customerRow(ownerId = 83) {
  return [{ id: 1, name: 'X Cafe', owner_id: ownerId, address: 'Boeng Tuk' }];
}

test('scenarios.create - 合法字段创建成功', async () => {
  const db = mockDb([
    { match: 'FROM customers', return: customerRow() },
    { match: 'INSERT INTO scenarios', return: { insertId: 10 } },
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: [{
      id: 10, scenario_no: 'SC-TEST-1000', customer_id: 1,
      grid_type: 'hybrid', install_type: 'rooftop', scene_type: 'cafe',
      monthly_kwh: 1100, area_sqm: 80, peak_load_kw: 8, day_kwh: 500, night_kwh: 300,
      notes: '冒烟', created_by: 83, created_at: '2026-01-01', updated_at: '2026-01-01',
    }] },
  ]);
  const ctx = mockCtx({
    user: adminUser, params: { customerId: 1 }, db,
    body: { grid_type: 'hybrid', install_type: 'rooftop', scene_type: 'cafe',
      monthly_kwh: 1100, area_sqm: 80, peak_load_kw: 8, day_kwh: 500, night_kwh: 300 },
  });
  await scenarios.create(ctx);
  assert.equal(ctx.status, 201);
  assert.equal(ctx.body.scenario.id, 10);
  assert.equal(ctx.body.scenario.grid_type, 'hybrid');
  assert.equal(ctx.body.scenario.monthly_kwh, 1100);
});

test('scenarios.create - 非法 grid_type 抛 400', async () => {
  const db = mockDb([{ match: 'FROM customers', return: customerRow() }]);
  const ctx = mockCtx({ user: adminUser, params: { customerId: 1 }, db,
    body: { grid_type: 'bad', install_type: 'rooftop', scene_type: 'cafe' } });
  await expectThrow(() => scenarios.create(ctx), 400, 'invalid_grid_type');
});

test('scenarios.create - 非法 install_type 抛 400', async () => {
  const db = mockDb([{ match: 'FROM customers', return: customerRow() }]);
  const ctx = mockCtx({ user: adminUser, params: { customerId: 1 }, db,
    body: { grid_type: 'on_grid', install_type: 'wall', scene_type: 'cafe' } });
  await expectThrow(() => scenarios.create(ctx), 400, 'invalid_install_type');
});

test('scenarios.create - 非法 scene_type 抛 400', async () => {
  const db = mockDb([{ match: 'FROM customers', return: customerRow() }]);
  const ctx = mockCtx({ user: adminUser, params: { customerId: 1 }, db,
    body: { grid_type: 'on_grid', install_type: 'rooftop', scene_type: 'factory' } });
  await expectThrow(() => scenarios.create(ctx), 400, 'invalid_scene_type');
});

test('scenarios.create - 客户不存在抛 404', async () => {
  const db = mockDb([{ match: 'FROM customers', return: [] }]);
  const ctx = mockCtx({ user: adminUser, params: { customerId: 999 }, db,
    body: { grid_type: 'on_grid', install_type: 'rooftop', scene_type: 'cafe' } });
  await expectThrow(() => scenarios.create(ctx), 404, 'customer_not_found');
});

test('scenarios.list - 返回该客户的场景列表', async () => {
  const rows = [
    { id: 1, scenario_no: 'SC-1', customer_id: 1, grid_type: 'on_grid', install_type: 'rooftop', scene_type: 'cafe', monthly_kwh: 1100, area_sqm: 80, peak_load_kw: 8, day_kwh: 500, night_kwh: 300, notes: null, created_by: 83, created_at: '2026-01-01', updated_at: '2026-01-01' },
  ];
  const db = mockDb([
    { match: 'FROM customers', return: customerRow() },
    { match: 'SELECT * FROM scenarios WHERE customer_id = ?', return: rows },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { customerId: 1 }, db });
  await scenarios.list(ctx);
  assert.equal(ctx.body.scenarios.length, 1);
  assert.equal(ctx.body.scenarios[0].scenario_no, 'SC-1');
});

test('scenarios.remove - 删除场景及关联配置', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: [{ id: 5, customer_id: 1 }] },
    { match: 'FROM customers', return: customerRow() },
    { match: 'DELETE FROM system_configs', return: [{ affectedRows: 2 }] },
    { match: 'DELETE FROM scenarios', return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { id: 5 }, db });
  await scenarios.remove(ctx);
  assert.deepEqual(ctx.body, { id: 5, deleted: true });
});
