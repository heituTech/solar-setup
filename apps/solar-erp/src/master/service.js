'use strict';

const { withTransaction } = require('../common/db');
const { nextCode } = require('../common/codes');
const { record } = require('../common/audit');
const { badRequest, notFound, conflict, pageParams, paged, str, money } = require('../common/http');

const STATUS_ENUM = ['active', 'inactive'];

/**
 * 主数据资源定义（简易 MDM）。统一编码与字段校验集中在这里，
 * 将来拆出 MDM 服务时可直接迁走。
 */
const RESOURCES = {
  stores: {
    table: 'stores', label: '门店', seq: 'store', prefix: 'ST',
    search: ['code', 'name', 'region', 'phone'],
    fields: {
      name: { required: true, max: 120 },
      region: { max: 120 },
      address: { max: 255 },
      phone: { max: 40 },
      manager_name: { max: 80 },
      status: { max: 20, default: 'active', enum: STATUS_ENUM },
    },
  },
  products: {
    table: 'products', label: '产品', seq: 'product', prefix: 'PRD',
    search: ['code', 'name', 'brand', 'model'],
    fields: {
      name: { required: true, max: 160 },
      category: { max: 40, default: 'other', enum: ['module', 'inverter', 'bracket', 'cable', 'battery', 'distribution_box', 'other'] },
      brand: { max: 80 },
      model: { max: 120 },
      spec: { max: 255 },
      unit: { max: 20, default: 'pcs' },
      sale_price: { type: 'money' },
      cost_price: { type: 'money' },
      supplier_id: { type: 'int' },
      status: { max: 20, default: 'active', enum: STATUS_ENUM },
    },
  },
  suppliers: {
    table: 'suppliers', label: '供应商', seq: 'supplier', prefix: 'SUP',
    search: ['code', 'name', 'contact', 'phone'],
    fields: {
      name: { required: true, max: 160 },
      contact: { max: 80 },
      phone: { max: 40 },
      address: { max: 255 },
      status: { max: 20, default: 'active', enum: STATUS_ENUM },
    },
  },
  engineers: {
    table: 'engineers', label: '工程师', seq: 'engineer', prefix: 'ENG',
    search: ['code', 'name', 'phone'],
    fields: {
      name: { required: true, max: 80 },
      type: { max: 30, default: 'electrical', enum: ['electrical', 'structural'] },
      phone: { max: 40 },
      user_id: { type: 'int' },
      status: { max: 20, default: 'active', enum: STATUS_ENUM },
    },
  },
  crews: {
    table: 'crews', label: '班组', seq: 'crew', prefix: 'CRW',
    search: ['code', 'name', 'leader_name', 'phone'],
    fields: {
      name: { required: true, max: 120 },
      leader_name: { max: 80 },
      captain_user_id: { type: 'int' },
      phone: { max: 40 },
      store_id: { type: 'int' },
      status: { max: 20, default: 'active', enum: STATUS_ENUM },
    },
  },
};

function defOf(resource) {
  const def = RESOURCES[resource];
  if (!def) notFound('unknown_resource');
  return def;
}

function buildPayload(def, body, { partial }) {
  const payload = {};
  for (const [field, rule] of Object.entries(def.fields)) {
    const provided = Object.prototype.hasOwnProperty.call(body, field);
    if (!provided) {
      if (!partial && rule.required) badRequest(`${field}_required`);
      if (!partial && rule.default !== undefined) payload[field] = rule.default;
      continue;
    }
    let value = body[field];
    if (rule.type === 'money') {
      value = money(value);
    } else if (rule.type === 'int') {
      value = value === null || value === undefined || value === '' ? null : Number(value) || null;
    } else {
      value = str(value, { required: rule.required, max: rule.max, field });
      if (rule.enum && value && !rule.enum.includes(value)) badRequest(`invalid_${field}`);
    }
    payload[field] = value;
  }
  return payload;
}

async function list(db, resource, query = {}) {
  const def = defOf(resource);
  const { page, pageSize, offset } = pageParams(query);
  const where = [];
  const params = [];
  if (query.keyword) {
    where.push(`(${def.search.map((column) => `${column} LIKE ?`).join(' OR ')})`);
    for (let i = 0; i < def.search.length; i += 1) params.push(`%${query.keyword}%`);
  }
  if (query.status) { where.push('status = ?'); params.push(query.status); }
  if (query.category && def.fields.category) { where.push('category = ?'); params.push(query.category); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM ${def.table} ${clause}`, params);
  const [items] = await db.query(
    `SELECT * FROM ${def.table} ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return paged(items, total, page, pageSize);
}

async function detail(db, resource, id) {
  const def = defOf(resource);
  const [rows] = await db.query(`SELECT * FROM ${def.table} WHERE id = ? LIMIT 1`, [id]);
  if (!rows.length) notFound('record_not_found');
  return rows[0];
}

async function create(db, resource, body, actor) {
  const def = defOf(resource);
  const payload = buildPayload(def, body, { partial: false });
  return withTransaction(db, async (conn) => {
    payload.code = await nextCode(conn, def.seq, def.prefix, { width: 4 });
    const columns = Object.keys(payload);
    const [inserted] = await conn.query(
      `INSERT INTO ${def.table} (${columns.map((c) => `\`${c}\``).join(',')})
       VALUES (${columns.map(() => '?').join(',')})`,
      columns.map((c) => payload[c])
    );
    const [rows] = await conn.query(`SELECT * FROM ${def.table} WHERE id = ?`, [inserted.insertId]);
    await record(conn, {
      module: 'master', entity: resource, entityId: inserted.insertId,
      action: 'create', actor, after: rows[0],
    });
    return rows[0];
  });
}

async function update(db, resource, id, body, actor) {
  const def = defOf(resource);
  const before = await detail(db, resource, id);
  const payload = buildPayload(def, body, { partial: true });
  const columns = Object.keys(payload);
  if (!columns.length) badRequest('nothing_to_update');
  return withTransaction(db, async (conn) => {
    await conn.query(
      `UPDATE ${def.table} SET ${columns.map((c) => `\`${c}\` = ?`).join(',')} WHERE id = ?`,
      [...columns.map((c) => payload[c]), id]
    );
    const [rows] = await conn.query(`SELECT * FROM ${def.table} WHERE id = ?`, [id]);
    await record(conn, {
      module: 'master', entity: resource, entityId: id,
      action: 'update', actor, before, after: rows[0],
    });
    return rows[0];
  });
}

async function remove(db, resource, id, actor) {
  const def = defOf(resource);
  const before = await detail(db, resource, id);
  if (resource === 'stores') {
    const [users] = await db.query('SELECT COUNT(*) AS total FROM users WHERE store_id = ? AND status = ?', [id, 'active']);
    if (Number(users[0].total) > 0) conflict('store_in_use');
  }
  return withTransaction(db, async (conn) => {
    await conn.query(`UPDATE ${def.table} SET status = 'inactive' WHERE id = ?`, [id]);
    await record(conn, {
      module: 'master', entity: resource, entityId: id,
      action: 'disable', actor, before, after: { ...before, status: 'inactive' },
    });
    return { id: Number(id), status: 'inactive' };
  });
}

async function options(db) {
  const [stores] = await db.query(
    "SELECT id, code, name, region FROM stores WHERE status = 'active' ORDER BY id"
  );
  const [products] = await db.query(
    `SELECT id, code, name, category, brand, model, unit, sale_price, cost_price
     FROM products WHERE status = 'active' ORDER BY category, id`
  );
  const [suppliers] = await db.query("SELECT id, code, name FROM suppliers WHERE status = 'active' ORDER BY id");
  const [engineers] = await db.query(
    "SELECT id, code, name, type, phone, user_id FROM engineers WHERE status = 'active' ORDER BY id"
  );
  const [crews] = await db.query(
    "SELECT id, code, name, leader_name, captain_user_id, store_id FROM crews WHERE status = 'active' ORDER BY id"
  );
  const [captains] = await db.query(
    "SELECT id, name, username FROM users WHERE role = 'construction_captain' AND status = 'active' ORDER BY id"
  );
  return {
    stores, products, suppliers, engineers, crews, captains,
    product_categories: [
      { value: 'module', label: '光伏组件' },
      { value: 'inverter', label: '逆变器' },
      { value: 'battery', label: '电池' },
      { value: 'bracket', label: '支架' },
      { value: 'cable', label: '线缆' },
      { value: 'distribution_box', label: '配电箱' },
      { value: 'other', label: '其他' },
    ],
    payment_methods: [
      { value: 'cash', label: '现金' },
      { value: 'bank', label: '银行转账' },
      { value: 'wechat', label: '微信' },
      { value: 'alipay', label: '支付宝' },
      { value: 'payment_gateway', label: '支付渠道' },
    ],
  };
}

module.exports = { RESOURCES, defOf, list, detail, create, update, remove, options };
