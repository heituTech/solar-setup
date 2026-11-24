'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mockDb, mockCtx, expectThrow } = require('./helper');
const systemConfigs = require('../app/controller/systemConfigs');

const adminUser = { id: 83, role: 'super_admin', name: 'Super Admin' };

// 基础产品（与 004 seed 一致）
const products = {
  panel450:  { id: 2, category: 'PV module', model: 'PANEL-450W', name: '单晶硅光伏板 450W', specs: JSON.stringify({ power: 0.45, efficiency: 0.21 }), price: 85, unit: '块', status: 'active', is_package: 0 },
  panel550:  { id: 3, category: 'PV module', model: 'PANEL-550W', name: '单晶硅光伏板 550W', specs: JSON.stringify({ power: 0.55, efficiency: 0.22 }), price: 105, unit: '块', status: 'active', is_package: 0 },
  inv5:      { id: 4, category: 'Invertor', model: 'INV-5K', name: '并网逆变器 5kW', specs: JSON.stringify({ power: 5, type: 'on_grid' }), price: 680, unit: '台', status: 'active', is_package: 0 },
  inv10:     { id: 5, category: 'Invertor', model: 'INV-10K', name: '并网逆变器 10kW', specs: JSON.stringify({ power: 10, type: 'on_grid' }), price: 1250, unit: '台', status: 'active', is_package: 0 },
  invHybrid: { id: 6, category: 'Invertor', model: 'INV-HYB-8K', name: '混合逆变器 8kW', specs: JSON.stringify({ power: 8, type: 'hybrid' }), price: 1480, unit: '台', status: 'active', is_package: 0 },
  bat5:      { id: 7, category: 'battery', model: 'BAT-5KWH', name: '锂电池 5kWh', specs: JSON.stringify({ capacity: 5, type: 'lithium' }), price: 1800, unit: '组', status: 'active', is_package: 0 },
  bat10:     { id: 8, category: 'battery', model: 'BAT-10KWH', name: '锂电池 10kWh', specs: JSON.stringify({ capacity: 10, type: 'lithium' }), price: 3400, unit: '组', status: 'active', is_package: 0 },
  mountRoof: { id: 9, category: 'mounting bracket', model: 'MOUNT-ROOF', name: '屋顶支架（每 kW）', specs: JSON.stringify({ type: 'rooftop' }), price: 45, unit: 'kW', status: 'active', is_package: 0 },
  mountGround: { id: 10, category: 'mounting bracket', model: 'MOUNT-GROUND', name: '地面支架（每 kW）', specs: JSON.stringify({ type: 'ground' }), price: 65, unit: 'kW', status: 'active', is_package: 0 },
};

function scenarioRow(overrides = {}) {
  return [{
    id: 1, customer_id: 1, grid_type: 'hybrid', install_type: 'rooftop', scene_type: 'cafe',
    monthly_kwh: 1100, area_sqm: 80, peak_load_kw: 8, day_kwh: 500, night_kwh: 300,
    notes: null, created_by: 83, created_at: '2026-01-01', updated_at: '2026-01-01',
    ...overrides,
  }];
}

function customerRow() {
  return [{ id: 1, owner_id: 83 }];
}

// 匹配 pickProduct 按分类查询的 SQL
function byCategory(cat) {
  return (sql, params) => sql.includes('category = ?') && params[0] === cat;
}

function configRow(items, overrides = {}) {
  return [{
    id: 1, config_no: 'CF-TEST', scenario_id: 1, method: 'formula', package_id: null,
    capacity_kw: 10, inverter_kw: 9.6, battery_kwh: 300,
    items: JSON.stringify(items), reference_total: 0, notes: null, created_by: 83, created_at: '2026-01-01',
    ...overrides,
  }];
}

// ===================== formulaCompute（通过 formulaPreview 间接测试）=====================

test('systemConfigs.formulaPreview - 标准场景：容量=月电/110，逆变=峰值×1.2，电池=夜用电', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow() },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db });
  await systemConfigs.formulaPreview(ctx);
  // 1100 / 110 = 10
  assert.equal(ctx.body.capacity_kw, 10);
  // 8 * 1.2 = 9.6
  assert.equal(ctx.body.inverter_kw, 9.6);
  // night = 300
  assert.equal(ctx.body.battery_kwh, 300);
});

test('systemConfigs.formulaPreview - 全零场景返回 null', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow({ monthly_kwh: 0, peak_load_kw: 0, night_kwh: 0 }) },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db });
  await systemConfigs.formulaPreview(ctx);
  assert.equal(ctx.body.capacity_kw, null);
  assert.equal(ctx.body.inverter_kw, null);
  assert.equal(ctx.body.battery_kwh, null);
});

test('systemConfigs.formulaPreview - 小数精度（月电 1000 → 9.09）', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow({ monthly_kwh: 1000, peak_load_kw: 0, night_kwh: 0 }) },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db });
  await systemConfigs.formulaPreview(ctx);
  // 1000 / 110 = 9.0909... → 9.09
  assert.equal(ctx.body.capacity_kw, 9.09);
});

// ===================== create: formula 模式 =====================

function buildDbForFormulaCreate() {
  return mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow() },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
    // pickProduct 按分类查
    { match: byCategory('PV module'), return: [products.panel450, products.panel550] },
    { match: byCategory('Invertor'), return: [products.inv5, products.inv10, products.invHybrid] },
    { match: byCategory('battery'), return: [products.bat5, products.bat10] },
    { match: byCategory('mounting bracket'), return: [products.mountRoof, products.mountGround] },
    { match: 'INSERT INTO system_configs', return: { insertId: 1 } },
    { match: 'SELECT * FROM system_configs WHERE id = ?', return: (params) => {
      // 从 INSERT 调用里取 items，这里用 db.calls 反查
      return [];
    } },
  ]);
}

test('systemConfigs.create - formula 模式自动选品并计算参考总价', async () => {
  // 用真实 items 回写的方式模拟
  let insertedItems = null;
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow() },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
    { match: byCategory('PV module'), return: [products.panel450, products.panel550] },
    { match: byCategory('Invertor'), return: [products.inv5, products.inv10, products.invHybrid] },
    { match: byCategory('battery'), return: [products.bat5, products.bat10] },
    { match: byCategory('mounting bracket'), return: [products.mountRoof, products.mountGround] },
    { match: 'INSERT INTO system_configs', return: (params) => {
      // params: [config_no, scenario_id, method, package_id, capacity, inverter, battery, items(JSON), ref_total, notes, created_by]
      insertedItems = JSON.parse(params[7]);
      return { insertId: 1 };
    } },
    { match: 'SELECT * FROM system_configs WHERE id = ?', return: (params) => {
      const row = configRow(insertedItems, {
        capacity_kw: 10, inverter_kw: 9.6, battery_kwh: 300,
        reference_total: insertedItems.reduce((s, it) => s + (it.subtotal || it.qty * it.unit_price), 0),
      });
      return row;
    } },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db, body: { method: 'formula' } });
  await systemConfigs.create(ctx);

  const items = ctx.body.config.items;
  // 光伏板：目标 10kW，选最接近的 0.55kW 板（550W 比 450W 更接近... 实际 0.55 与 0.45 都不接近 10，但 pickProduct 按 power 与 target 差值最小）
  // 实际算法：pickProduct 找 specs.power 最接近 targetKw 的。target=10，panel 的 power 是 0.45/0.55，0.55 更近 → PANEL-550W
  const panel = items.find(i => i.product_id === 3);
  assert.ok(panel, '应选中 PANEL-550W');
  // qty = ceil(10 / 0.55) = ceil(18.18) = 19
  assert.equal(panel.qty, 19);
  assert.equal(panel.subtotal, 19 * 105);

  // 逆变器：目标 9.6kW，INV-10K(power=10) 比 INV-HYB-8K(8)、INV-5K(5) 更近
  const inv = items.find(i => i.product_id === 5);
  assert.ok(inv, '应选中 INV-10K');
  assert.equal(inv.qty, 1);
  assert.equal(inv.subtotal, 1250);

  // 电池：目标 300kWh，BAT-10KWH(capacity=10) 比 BAT-5KWH(5) 更近
  const bat = items.find(i => i.product_id === 8);
  assert.ok(bat, '应选中 BAT-10KWH');
  // qty = ceil(300 / 10) = 30
  assert.equal(bat.qty, 30);
  assert.equal(bat.subtotal, 30 * 3400);

  // 支架：target=null，取第一个 MOUNT-ROOF
  const mount = items.find(i => i.product_id === 9);
  assert.ok(mount, '应选中 MOUNT-ROOF');
  assert.equal(mount.qty, 1);

  // reference_total = 19*105 + 1250 + 30*3400 + 45 = 1995 + 1250 + 102000 + 45 = 105290
  assert.equal(ctx.body.config.reference_total, 105290);
  assert.equal(ctx.body.config.capacity_kw, 10);
  assert.equal(ctx.body.config.inverter_kw, 9.6);
  assert.equal(ctx.body.config.battery_kwh, 300);
});

test('systemConfigs.create - formula 模式无夜用电时不生成电池项', async () => {
  let insertedItems = null;
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow({ night_kwh: 0 }) },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
    { match: byCategory('PV module'), return: [products.panel550] },
    { match: byCategory('Invertor'), return: [products.inv10] },
    { match: byCategory('battery'), return: [products.bat10] },
    { match: byCategory('mounting bracket'), return: [products.mountRoof] },
    { match: 'INSERT INTO system_configs', return: (params) => {
      insertedItems = JSON.parse(params[7]);
      return { insertId: 1 };
    } },
    { match: 'SELECT * FROM system_configs WHERE id = ?', return: () => configRow(insertedItems) },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db, body: { method: 'formula' } });
  await systemConfigs.create(ctx);
  const hasBattery = ctx.body.config.items.some(i => i.name.includes('电池'));
  assert.equal(hasBattery, false, 'night_kwh=0 时不应生成电池项');
});

// ===================== create: package 模式 =====================

const pkgHome5K = { id: 17, category: 'package', model: 'PKG-HOME-5K', name: '户用 5kW 并网套餐', specs: JSON.stringify({ capacity_kw: 5 }), price: 0, unit: '套', status: 'active', is_package: 1 };

test('systemConfigs.create - package 模式展开套餐组成', async () => {
  let insertedItems = null;
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow() },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
    { match: "is_package = 1", return: [pkgHome5K] },
    { match: 'FROM package_items pi JOIN products', return: [
      { product_id: 3, qty: 10, name: '单晶硅光伏板 550W', price: 105, unit: '块' },
      { product_id: 4, qty: 1, name: '并网逆变器 5kW', price: 680, unit: '台' },
      { product_id: 9, qty: 5, name: '屋顶支架（每 kW）', price: 45, unit: 'kW' },
    ] },
    { match: 'INSERT INTO system_configs', return: (params) => {
      insertedItems = JSON.parse(params[7]);
      return { insertId: 2 };
    } },
    { match: 'SELECT * FROM system_configs WHERE id = ?', return: () => configRow(insertedItems, { id: 2, method: 'package', package_id: 17, capacity_kw: null, inverter_kw: null, battery_kwh: null, reference_total: insertedItems.reduce((s, it) => s + it.subtotal, 0) }) },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db, body: { method: 'package', package_id: 17 } });
  await systemConfigs.create(ctx);

  assert.equal(ctx.body.config.method, 'package');
  assert.equal(ctx.body.config.package_id, 17);
  assert.equal(ctx.body.config.items.length, 3);
  // 10 * 105 + 1 * 680 + 5 * 45 = 1050 + 680 + 225 = 1955
  assert.equal(ctx.body.config.reference_total, 1955);
});

test('systemConfigs.create - package 未传 package_id 抛 400', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow() },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db, body: { method: 'package' } });
  await expectThrow(() => systemConfigs.create(ctx), 400, 'package_required');
});

test('systemConfigs.create - package 不存在抛 404', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow() },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
    { match: "is_package = 1", return: [] },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db, body: { method: 'package', package_id: 999 } });
  await expectThrow(() => systemConfigs.create(ctx), 404, 'package_not_found');
});

// ===================== create: manual 模式 =====================

test('systemConfigs.create - manual 模式使用传入 items', async () => {
  let insertedItems = null;
  const manualItems = [
    { product_id: 3, name: '单晶硅光伏板 550W', qty: 5, unit_price: 105, subtotal: 525 },
  ];
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow() },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
    { match: 'INSERT INTO system_configs', return: (params) => {
      insertedItems = JSON.parse(params[7]);
      return { insertId: 3 };
    } },
    { match: 'SELECT * FROM system_configs WHERE id = ?', return: () => configRow(insertedItems, { id: 3, method: 'manual', reference_total: 525 }) },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db, body: { method: 'manual', items: manualItems } });
  await systemConfigs.create(ctx);
  assert.equal(ctx.body.config.method, 'manual');
  assert.equal(ctx.body.config.items.length, 1);
  assert.equal(ctx.body.config.reference_total, 525);
});

test('systemConfigs.create - manual 无 items 抛 400', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow() },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db, body: { method: 'manual' } });
  await expectThrow(() => systemConfigs.create(ctx), 400, 'items_required');
});

test('systemConfigs.create - 非法 method 抛 400', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM scenarios WHERE id = ?', return: scenarioRow() },
    { match: 'SELECT owner_id FROM customers', return: customerRow() },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { scenarioId: 1 }, db, body: { method: 'magic' } });
  await expectThrow(() => systemConfigs.create(ctx), 400, 'invalid_method');
});
