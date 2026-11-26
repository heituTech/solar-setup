'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
const bcrypt = require('bcryptjs');
const { createDatabase } = require('@solar/service-kit');

const USERS = [
  { username: 'admin', password: 'admin123', name: '系统管理员', role: 'admin', store: null },
  { username: 'manager', password: 'manager123', name: '张店长', role: 'store_manager', store: true },
  { username: 'clerk', password: 'clerk123', name: '李店员', role: 'store_clerk', store: true },
  { username: 'engineer', password: 'engineer123', name: '王电气', role: 'electrical_engineer', store: null },
  { username: 'engineer2', password: 'engineer123', name: '赵结构', role: 'structural_engineer', store: null },
  { username: 'captain', password: 'captain123', name: '陈队长', role: 'construction_captain', store: null },
];

const PRODUCTS = [
  { code: 'PRD0001', name: '单晶光伏组件 550W', category: 'module', brand: '天合', model: 'TSM-550', spec: '550W 单面', unit: 'pcs', sale: 780, cost: 620 },
  { code: 'PRD0002', name: '单晶光伏组件 580W', category: 'module', brand: '隆基', model: 'LR5-580', spec: '580W 双面', unit: 'pcs', sale: 830, cost: 660 },
  { code: 'PRD0003', name: '并网逆变器 10kW', category: 'inverter', brand: '华为', model: 'SUN2000-10KTL', spec: '三相 10kW', unit: 'pcs', sale: 5200, cost: 4300 },
  { code: 'PRD0004', name: '并网逆变器 20kW', category: 'inverter', brand: '阳光电源', model: 'SG20RT', spec: '三相 20kW', unit: 'pcs', sale: 8800, cost: 7400 },
  { code: 'PRD0005', name: '储能电池 5kWh', category: 'battery', brand: '派能', model: 'US5000', spec: '5kWh 磷酸铁锂', unit: 'pcs', sale: 6800, cost: 5600 },
  { code: 'PRD0006', name: '铝合金屋顶支架', category: 'bracket', brand: '通用', model: 'AL-RF', spec: '彩钢瓦/瓦屋面', unit: 'm', sale: 45, cost: 32 },
  { code: 'PRD0007', name: '光伏直流线缆 4mm²', category: 'cable', brand: '通用', model: 'PV1-F', spec: '4mm² 1500V', unit: 'm', sale: 6, cost: 4 },
  { code: 'PRD0008', name: '交流配电箱 20kW', category: 'distribution_box', brand: '通用', model: 'AC-20K', spec: '含防雷/断路', unit: 'pcs', sale: 1200, cost: 900 },
];

const STOCKS = [
  ['PRD0001', 200, 50], ['PRD0002', 150, 50], ['PRD0003', 12, 3], ['PRD0004', 8, 3],
  ['PRD0005', 6, 2], ['PRD0006', 800, 200], ['PRD0007', 3000, 500], ['PRD0008', 10, 2],
];

async function main() {
  const db = createDatabase({ connectionLimit: 2 });
  try {
    await db.query(
      `INSERT INTO stores (code, name, region, address, phone, manager_name)
       VALUES ('ST0001', '金边旗舰店', '金边市', '金边市桑园区 123 号', '+85512345678', '张店长')
       ON DUPLICATE KEY UPDATE name = VALUES(name), region = VALUES(region), address = VALUES(address)`
    );
    const [[store]] = await db.query("SELECT id FROM stores WHERE code = 'ST0001'");

    for (const user of USERS) {
      await db.query(
        `INSERT INTO users (username, password_hash, name, role, store_id, status)
         VALUES (?,?,?,?,?, 'active')
         ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), store_id = VALUES(store_id), status = 'active'`,
        [user.username, bcrypt.hashSync(user.password, 10), user.name, user.role, user.store ? store.id : null]
      );
    }

    await db.query(
      `INSERT INTO suppliers (code, name, contact, phone, address)
       VALUES ('SUP0001', '天合光能（柬埔寨）', '刘经理', '+85598765432', '金边市工业区')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`
    );
    const [[supplier]] = await db.query("SELECT id FROM suppliers WHERE code = 'SUP0001'");

    for (const product of PRODUCTS) {
      await db.query(
        `INSERT INTO products (code, name, category, brand, model, spec, unit, sale_price, cost_price, supplier_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category), brand = VALUES(brand),
           model = VALUES(model), spec = VALUES(spec), unit = VALUES(unit),
           sale_price = VALUES(sale_price), cost_price = VALUES(cost_price), supplier_id = VALUES(supplier_id)`,
        [product.code, product.name, product.category, product.brand, product.model, product.spec,
          product.unit, product.sale, product.cost, supplier.id]
      );
    }

    const [[electrical]] = await db.query("SELECT id, name FROM users WHERE username = 'engineer'");
    const [[structural]] = await db.query("SELECT id, name FROM users WHERE username = 'engineer2'");
    const [[captain]] = await db.query("SELECT id, name FROM users WHERE username = 'captain'");

    await db.query(
      `INSERT INTO engineers (code, name, type, phone, user_id)
       VALUES ('ENG0001', ?, 'electrical', '+85511111111', ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), user_id = VALUES(user_id)`,
      [electrical.name, electrical.id]
    );
    await db.query(
      `INSERT INTO engineers (code, name, type, phone, user_id)
       VALUES ('ENG0002', ?, 'structural', '+85522222222', ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), user_id = VALUES(user_id)`,
      [structural.name, structural.id]
    );
    await db.query(
      `INSERT INTO crews (code, name, leader_name, captain_user_id, phone, store_id)
       VALUES ('CRW0001', '一号施工队', ?, ?, '+85533333333', ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), captain_user_id = VALUES(captain_user_id), store_id = VALUES(store_id)`,
      [captain.name, captain.id, store.id]
    );

    for (const [code, qty, safety] of STOCKS) {
      const [[product]] = await db.query('SELECT id, cost_price FROM products WHERE code = ?', [code]);
      await db.query(
        `INSERT INTO stocks (store_id, product_id, qty, safety_qty, cost_price)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE qty = VALUES(qty), safety_qty = VALUES(safety_qty), cost_price = VALUES(cost_price)`,
        [store.id, product.id, qty, safety, product.cost_price]
      );
    }

    console.log('seed done');
    console.log('账号：admin/admin123、manager/manager123、clerk/clerk123、engineer/engineer123、engineer2/engineer123、captain/captain123');
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
