'use strict';

const crypto = require('crypto');
const { salesScopeFor, num, parseJson } = require('../../lib/scope');

function newNo(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function toConfig(row) {
  return {
    ...row,
    id: Number(row.id),
    scenario_id: Number(row.scenario_id),
    package_id: row.package_id ? Number(row.package_id) : null,
    capacity_kw: row.capacity_kw === null ? null : num(row.capacity_kw),
    inverter_kw: row.inverter_kw === null ? null : num(row.inverter_kw),
    battery_kwh: row.battery_kwh === null ? null : num(row.battery_kwh),
    items: parseJson(row.items, []),
    reference_total: num(row.reference_total),
    created_by: row.created_by ? Number(row.created_by) : null,
  };
}

async function assertScenarioAccess(ctx, scenarioId) {
  const [rows] = await ctx.app.db.query('SELECT * FROM scenarios WHERE id = ?', [scenarioId]);
  if (!rows.length) ctx.throw(404, 'scenario_not_found');
  const scenario = rows[0];
  const [customers] = await ctx.app.db.query('SELECT owner_id FROM customers WHERE id = ?', [scenario.customer_id]);
  const scope = salesScopeFor(ctx.state.user);
  if (scope !== null && customers.length && !scope.includes(Number(customers[0].owner_id))) {
    ctx.throw(403, 'forbidden');
  }
  return scenario;
}

// 经验公式：
//   光伏板总装机量 kW = 月均用电量 ÷ 110
//   逆变器容量 kW     = 负载峰值功率 × 1.2
//   电池容量 kWh      = 夜晚用电量
function formulaCompute(scenario) {
  const monthly = num(scenario.monthly_kwh);
  const peak = num(scenario.peak_load_kw);
  const night = num(scenario.night_kwh);
  return {
    capacity_kw: monthly > 0 ? Math.round((monthly / 110) * 100) / 100 : null,
    inverter_kw: peak > 0 ? Math.round(peak * 1.2 * 100) / 100 : null,
    battery_kwh: night > 0 ? Math.round(night * 100) / 100 : null,
  };
}

// 按分类匹配最贴近目标规格的产品
async function pickProduct(db, category, targetKw) {
  const [rows] = await db.query(
    "SELECT * FROM products WHERE category = ? AND status = 'active' AND is_package = 0",
    [category]
  );
  if (!rows.length) return null;
  if (!targetKw) return rows[0];
  // 按 specs.power / specs.capacity / specs.kw 中最接近 targetKw 的
  let best = rows[0];
  let bestDiff = Infinity;
  for (const p of rows) {
    const specs = parseJson(p.specs, {});
    const power = num(specs.power || specs.capacity || specs.kw || specs.kwh || 0);
    if (power > 0) {
      const diff = Math.abs(power - targetKw);
      if (diff < bestDiff) { bestDiff = diff; best = p; }
    }
  }
  return best;
}

module.exports = {
  // 公式预览：根据场景算出 capacity/inverter/battery 三个数
  async formulaPreview(ctx) {
    const scenarioId = Number(ctx.params.scenarioId);
    const scenario = await assertScenarioAccess(ctx, scenarioId);
    ctx.body = formulaCompute(scenario);
  },

  async list(ctx) {
    const scenarioId = Number(ctx.params.scenarioId);
    await assertScenarioAccess(ctx, scenarioId);
    const [rows] = await ctx.app.db.query(
      'SELECT * FROM system_configs WHERE scenario_id = ? ORDER BY id DESC', [scenarioId]
    );
    ctx.body = { configs: rows.map(toConfig) };
  },

  async detail(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM system_configs WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'config_not_found');
    await assertScenarioAccess(ctx, Number(rows[0].scenario_id));
    ctx.body = { config: toConfig(rows[0]) };
  },

  async create(ctx) {
    const scenarioId = Number(ctx.params.scenarioId);
    const scenario = await assertScenarioAccess(ctx, scenarioId);
    const body = ctx.request.body || {};
    const method = String(body.method || '');
    if (!['manual', 'package', 'formula'].includes(method)) ctx.throw(400, 'invalid_method');

    let items = [];
    let capacityKw = null;
    let inverterKw = null;
    let batteryKwh = null;
    let packageId = null;

    if (method === 'manual') {
      items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) ctx.throw(400, 'items_required');
    } else if (method === 'package') {
      packageId = Number(body.package_id);
      if (!packageId) ctx.throw(400, 'package_required');
      const [pkg] = await ctx.app.db.query(
        "SELECT * FROM products WHERE id = ? AND is_package = 1 AND status = 'active'", [packageId]
      );
      if (!pkg.length) ctx.throw(404, 'package_not_found');
      const [pkgItems] = await ctx.app.db.query(
        `SELECT pi.product_id, pi.qty, p.name, p.price, p.unit
         FROM package_items pi JOIN products p ON p.id = pi.product_id
         WHERE pi.package_id = ?`, [packageId]
      );
      items = pkgItems.map(it => ({
        product_id: Number(it.product_id), name: it.name,
        qty: Number(it.qty), unit_price: num(it.price),
        subtotal: Math.round(Number(it.qty) * num(it.price) * 100) / 100,
      }));
      // 销售可在生成后调整 items，这里只是初始值
    } else if (method === 'formula') {
      const computed = formulaCompute(scenario);
      capacityKw = computed.capacity_kw;
      inverterKw = computed.inverter_kw;
      batteryKwh = computed.battery_kwh;

      // 自动选品（分类统一英文存储）
      const panel = await pickProduct(ctx.app.db, 'PV module', capacityKw);
      const inverter = await pickProduct(ctx.app.db, 'Invertor', inverterKw);
      const battery = await pickProduct(ctx.app.db, 'battery', batteryKwh);
      const mount = await pickProduct(ctx.app.db, 'mounting bracket', null);

      // 光伏板数量：capacity_kw ÷ 单板功率（kW）
      if (panel) {
        const specs = parseJson(panel.specs, {});
        const panelPowerKw = num(specs.power || specs.kw || 0.45); // 默认 450W
        const qty = capacityKw ? Math.max(1, Math.ceil(capacityKw / panelPowerKw)) : 1;
        items.push({
          product_id: Number(panel.id), name: panel.name, qty,
          unit_price: num(panel.price),
          subtotal: Math.round(qty * num(panel.price) * 100) / 100,
        });
      }
      if (inverter) {
        items.push({
          product_id: Number(inverter.id), name: inverter.name, qty: 1,
          unit_price: num(inverter.price), subtotal: num(inverter.price),
        });
      }
      if (battery && batteryKwh) {
        const specs = parseJson(battery.specs, {});
        const batteryCapKwh = num(specs.capacity || specs.kwh || 5);
        const qty = Math.max(1, Math.ceil(batteryKwh / batteryCapKwh));
        items.push({
          product_id: Number(battery.id), name: battery.name, qty,
          unit_price: num(battery.price),
          subtotal: Math.round(qty * num(battery.price) * 100) / 100,
        });
      }
      if (mount) {
        items.push({
          product_id: Number(mount.id), name: mount.name, qty: 1,
          unit_price: num(mount.price), subtotal: num(mount.price),
        });
      }
    }

    const referenceTotal = items.reduce((s, it) => s + num(it.subtotal || it.qty * it.unit_price), 0);

    const [result] = await ctx.app.db.query(
      `INSERT INTO system_configs (config_no, scenario_id, method, package_id,
        capacity_kw, inverter_kw, battery_kwh, items, reference_total, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [newNo('CF'), scenarioId, method, packageId, capacityKw, inverterKw, batteryKwh,
        JSON.stringify(items), Math.round(referenceTotal * 100) / 100, body.notes || null,
        Number(ctx.state.user.id)]
    );
    const [rows] = await ctx.app.db.query('SELECT * FROM system_configs WHERE id = ?', [result.insertId]);
    ctx.status = 201;
    ctx.body = { config: toConfig(rows[0]) };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM system_configs WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'config_not_found');
    await assertScenarioAccess(ctx, Number(rows[0].scenario_id));
    const body = ctx.request.body || {};
    const items = Array.isArray(body.items) ? body.items : parseJson(rows[0].items, []);
    const referenceTotal = items.reduce((s, it) => s + num(it.subtotal || it.qty * it.unit_price), 0);
    await ctx.app.db.query(
      'UPDATE system_configs SET items = ?, reference_total = ?, notes = COALESCE(?, notes) WHERE id = ?',
      [JSON.stringify(items), Math.round(referenceTotal * 100) / 100, body.notes ?? null, id]
    );
    const [updated] = await ctx.app.db.query('SELECT * FROM system_configs WHERE id = ?', [id]);
    ctx.body = { config: toConfig(updated[0]) };
  },

  async remove(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM system_configs WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'config_not_found');
    await assertScenarioAccess(ctx, Number(rows[0].scenario_id));
    await ctx.app.db.query('DELETE FROM system_configs WHERE id = ?', [id]);
    ctx.body = { id, deleted: true };
  },
};
