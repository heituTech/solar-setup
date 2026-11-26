'use strict';

const { withTransaction } = require('../common/db');
const { nextCode, dayPeriod } = require('../common/codes');
const { record } = require('../common/audit');
const {
  badRequest, notFound, fail, money, qty, str, pageParams, paged,
} = require('../common/http');
const { storeFilter, projectFilter } = require('../common/scope');
const projectService = require('../project/service');
const financeService = require('../finance/service');

async function listStocks(db, query, user) {
  const { page, pageSize, offset } = pageParams(query);
  const filter = storeFilter(user, 'st.store_id');
  const where = [];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  if (query.store_id) { where.push('st.store_id = ?'); params.push(Number(query.store_id)); }
  if (query.keyword) {
    where.push('(p.code LIKE ? OR p.name LIKE ? OR p.brand LIKE ?)');
    const like = `%${query.keyword}%`;
    params.push(like, like, like);
  }
  if (query.low === '1') where.push('st.qty <= st.safety_qty');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM stocks st
     JOIN products p ON p.id = st.product_id ${clause}`, params
  );
  const [items] = await db.query(
    `SELECT st.*, p.code AS product_code, p.name AS product_name, p.unit, p.category,
            s.code AS store_code, s.name AS store_name
     FROM stocks st JOIN products p ON p.id = st.product_id
     LEFT JOIN stores s ON s.id = st.store_id
     ${clause} ORDER BY (st.qty <= st.safety_qty) DESC, st.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return paged(items, total, page, pageSize);
}

/** 入库 / 盘点调整：记录前后库存，形成可追溯流水。 */
async function adjustStock(db, payload, user) {
  const storeId = Number(payload.store_id);
  const productId = Number(payload.product_id);
  const mode = payload.mode === 'set' ? 'set' : 'in';
  if (!storeId || !productId) badRequest('store_and_product_required');
  const amount = qty(payload.qty);

  return withTransaction(db, async (conn) => {
    const [products] = await conn.query('SELECT * FROM products WHERE id = ? LIMIT 1', [productId]);
    if (!products.length) notFound('product_not_found');
    const [rows] = await conn.query('SELECT * FROM stocks WHERE store_id = ? AND product_id = ? FOR UPDATE', [storeId, productId]);
    const before = rows.length ? Number(rows[0].qty) : 0;
    const after = mode === 'set' ? amount : Math.round((before + amount) * 1000) / 1000;
    const costPrice = money(payload.cost_price, rows.length ? Number(rows[0].cost_price) : Number(products[0].cost_price));

    if (rows.length) {
      await conn.query('UPDATE stocks SET qty = ?, cost_price = ? WHERE id = ?', [after, costPrice, rows[0].id]);
    } else {
      await conn.query('INSERT INTO stocks (store_id, product_id, qty, safety_qty, cost_price) VALUES (?,?,?,?,?)',
        [storeId, productId, after, money(payload.safety_qty, 0), costPrice]);
    }
    await conn.query(
      `INSERT INTO stock_movements
       (store_id, product_id, type, qty, before_qty, after_qty, unit_cost, amount, ref_type, ref_id, operator_id, operator_name, remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [storeId, productId, mode === 'set' ? 'adjust' : 'in', Math.abs(after - before), before, after,
        costPrice, Math.round(Math.abs(after - before) * costPrice * 100) / 100, 'manual', null,
        user.id, user.name, str(payload.remark, { max: 255 })]
    );
    await record(conn, {
      module: 'inventory', entity: 'stock', entityId: `${storeId}:${productId}`, action: mode === 'set' ? 'adjust' : 'in',
      actor: { id: user.id, name: user.name }, before: { qty: before }, after: { qty: after },
    });
    return { store_id: storeId, product_id: productId, qty: after };
  });
}

async function listIssues(db, query, user) {
  const { page, pageSize, offset } = pageParams(query);
  const filter = projectFilter(user, 'p');
  const where = [];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  if (query.status) { where.push('i.status = ?'); params.push(query.status); }
  if (query.project_id) { where.push('i.project_id = ?'); params.push(Number(query.project_id)); }
  if (query.keyword) {
    where.push('(i.issue_no LIKE ? OR p.project_no LIKE ?)');
    params.push(`%${query.keyword}%`, `%${query.keyword}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM material_issues i
     JOIN projects p ON p.id = i.project_id ${clause}`, params
  );
  const [items] = await db.query(
    `SELECT i.*, p.project_no, p.customer_name, p.status AS project_status
     FROM material_issues i JOIN projects p ON p.id = i.project_id
     ${clause} ORDER BY i.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  if (items.length) {
    const ids = items.map((row) => row.id);
    const [lines] = await db.query(
      `SELECT * FROM material_issue_items WHERE issue_id IN (${ids.map(() => '?').join(',')})`, ids
    );
    for (const item of items) item.items = lines.filter((line) => Number(line.issue_id) === Number(item.id));
  }
  return paged(items, total, page, pageSize);
}

async function createIssue(db, payload, user) {
  const project = await projectService.getProject(db, Number(payload.project_id), user);
  if (!['contracted', 'material_issued', 'constructing'].includes(project.status)) {
    fail('invalid_project_status', 409, { current: project.status });
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) badRequest('issue_items_required');

  return withTransaction(db, async (conn) => {
    const issueNo = await nextCode(conn, 'issue', 'MI', { period: dayPeriod(), separator: '-', width: 4 });
    const [inserted] = await conn.query(
      `INSERT INTO material_issues (issue_no, project_id, store_id, status, requested_by, requested_by_name, remark)
       VALUES (?,?,?,?,?,?,?)`,
      [issueNo, project.id, project.store_id, 'draft', user.id, user.name, str(payload.remark, { max: 500 })]
    );
    let totalCost = 0;
    for (const item of items) {
      const productId = Number(item.product_id);
      const amount = qty(item.qty);
      const [products] = await conn.query('SELECT * FROM products WHERE id = ? LIMIT 1', [productId]);
      if (!products.length) badRequest('product_not_found');
      const [stock] = await conn.query('SELECT * FROM stocks WHERE store_id = ? AND product_id = ? LIMIT 1', [project.store_id, productId]);
      const costPrice = stock.length ? Number(stock[0].cost_price) : Number(products[0].cost_price);
      const lineAmount = Math.round(amount * costPrice * 100) / 100;
      totalCost += lineAmount;
      await conn.query(
        `INSERT INTO material_issue_items (issue_id, product_id, product_code, product_name, unit, qty, cost_price, amount)
         VALUES (?,?,?,?,?,?,?,?)`,
        [inserted.insertId, productId, products[0].code, products[0].name, products[0].unit, amount, costPrice, lineAmount]
      );
    }
    await conn.query('UPDATE material_issues SET total_cost = ? WHERE id = ?', [Math.round(totalCost * 100) / 100, inserted.insertId]);
    await record(conn, {
      module: 'inventory', entity: 'material_issue', entityId: inserted.insertId, action: 'create',
      actor: { id: user.id, name: user.name }, after: { issue_no: issueNo, total_cost: totalCost },
    });
    return { id: inserted.insertId, issue_no: issueNo, total_cost: Math.round(totalCost * 100) / 100 };
  });
}

async function approveIssue(db, id, user) {
  return withTransaction(db, async (conn) => {
    const [rows] = await conn.query('SELECT * FROM material_issues WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) notFound('issue_not_found');
    if (rows[0].status !== 'draft') fail('issue_not_draft', 409);
    await conn.query("UPDATE material_issues SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?", [user.id, id]);
    await record(conn, {
      module: 'inventory', entity: 'material_issue', entityId: id, action: 'approve',
      actor: { id: user.id, name: user.name }, before: { status: 'draft' }, after: { status: 'approved' },
    });
    return { id: Number(id), status: 'approved' };
  });
}

/** 出库：扣减门店库存 → 写流水 → 归集项目成本。 */
async function issueOut(db, id, user) {
  return withTransaction(db, async (conn) => {
    const [rows] = await conn.query('SELECT * FROM material_issues WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) notFound('issue_not_found');
    const issue = rows[0];
    if (issue.status !== 'approved') fail('issue_not_approved', 409);
    const [items] = await conn.query('SELECT * FROM material_issue_items WHERE issue_id = ?', [id]);
    let totalCost = 0;

    for (const item of items) {
      const [stocks] = await conn.query(
        'SELECT * FROM stocks WHERE store_id = ? AND product_id = ? FOR UPDATE', [issue.store_id, item.product_id]
      );
      const before = stocks.length ? Number(stocks[0].qty) : 0;
      if (before < Number(item.qty)) {
        fail('insufficient_stock', 409, { product_id: item.product_id, product_name: item.product_name, available: before, required: Number(item.qty) });
      }
      const after = Math.round((before - Number(item.qty)) * 1000) / 1000;
      const unitCost = stocks.length ? Number(stocks[0].cost_price) : Number(item.cost_price);
      const amount = Math.round(Number(item.qty) * unitCost * 100) / 100;
      totalCost += amount;
      await conn.query('UPDATE stocks SET qty = ? WHERE id = ?', [after, stocks[0].id]);
      await conn.query(
        `INSERT INTO stock_movements
         (store_id, product_id, type, qty, before_qty, after_qty, unit_cost, amount, ref_type, ref_id, operator_id, operator_name, remark)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [issue.store_id, item.product_id, 'out', Number(item.qty), before, after, unitCost, amount,
          'material_issue', issue.id, user.id, user.name, `项目领料 ${issue.issue_no}`]
      );
    }

    totalCost = Math.round(totalCost * 100) / 100;
    await conn.query("UPDATE material_issues SET status = 'issued', issued_at = NOW(), total_cost = ? WHERE id = ?", [totalCost, issue.id]);
    await financeService.addProjectCost(conn, {
      projectId: issue.project_id, type: 'material', amount: totalCost,
      refType: 'material_issue', refId: issue.id, remark: `领料出库 ${issue.issue_no}`, userId: user.id,
    });
    await projectService.markMaterialIssued(conn, issue.project_id, { id: user.id, name: user.name });
    await record(conn, {
      module: 'inventory', entity: 'material_issue', entityId: issue.id, action: 'out',
      actor: { id: user.id, name: user.name }, before: { status: 'approved' }, after: { status: 'issued', total_cost: totalCost },
    });
    return { id: issue.id, status: 'issued', total_cost: totalCost };
  });
}

/** 余料退回：库存加回、成本冲减。 */
async function returnMaterials(db, id, payload, user) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) badRequest('return_items_required');
  return withTransaction(db, async (conn) => {
    const [rows] = await conn.query('SELECT * FROM material_issues WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) notFound('issue_not_found');
    const issue = rows[0];
    if (issue.status !== 'issued') fail('issue_not_issued', 409);
    const [lines] = await conn.query('SELECT * FROM material_issue_items WHERE issue_id = ?', [id]);

    const normalized = [];
    let totalAmount = 0;
    for (const item of items) {
      const productId = Number(item.product_id);
      const amount = qty(item.qty);
      const line = lines.find((row) => Number(row.product_id) === productId);
      if (!line) badRequest('product_not_in_issue');
      if (amount > Number(line.qty)) fail('return_exceeds_issued', 400, { product_id: productId, issued: Number(line.qty) });
      const [stocks] = await conn.query('SELECT * FROM stocks WHERE store_id = ? AND product_id = ? FOR UPDATE', [issue.store_id, productId]);
      const before = stocks.length ? Number(stocks[0].qty) : 0;
      const after = Math.round((before + amount) * 1000) / 1000;
      const unitCost = Number(line.cost_price);
      const amountValue = Math.round(amount * unitCost * 100) / 100;
      totalAmount += amountValue;
      if (stocks.length) {
        await conn.query('UPDATE stocks SET qty = ? WHERE id = ?', [after, stocks[0].id]);
      } else {
        await conn.query('INSERT INTO stocks (store_id, product_id, qty, cost_price) VALUES (?,?,?,?)',
          [issue.store_id, productId, after, unitCost]);
      }
      await conn.query(
        `INSERT INTO stock_movements
         (store_id, product_id, type, qty, before_qty, after_qty, unit_cost, amount, ref_type, ref_id, operator_id, operator_name, remark)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [issue.store_id, productId, 'return', amount, before, after, unitCost, amountValue,
          'material_return', issue.id, user.id, user.name, `项目余料退回 ${issue.issue_no}`]
      );
      normalized.push({ product_id: productId, product_name: line.product_name, qty: amount, amount: amountValue });
    }

    totalAmount = Math.round(totalAmount * 100) / 100;
    const returnNo = await nextCode(conn, 'material_return', 'RT', { period: dayPeriod(), separator: '-', width: 4 });
    const [inserted] = await conn.query(
      `INSERT INTO material_returns (return_no, issue_id, project_id, store_id, items, amount, operator_id, operator_name, remark)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [returnNo, issue.id, issue.project_id, issue.store_id, JSON.stringify(normalized), totalAmount,
        user.id, user.name, str(payload.remark, { max: 255 })]
    );
    await financeService.addProjectCost(conn, {
      projectId: issue.project_id, type: 'material', amount: -totalAmount,
      refType: 'material_return', refId: inserted.insertId, remark: `余料退回 ${returnNo}`, userId: user.id,
    });
    await record(conn, {
      module: 'inventory', entity: 'material_return', entityId: inserted.insertId, action: 'return',
      actor: { id: user.id, name: user.name }, after: { return_no: returnNo, amount: totalAmount },
    });
    return { id: inserted.insertId, return_no: returnNo, amount: totalAmount };
  });
}

async function listMovements(db, query, user) {
  const { page, pageSize, offset } = pageParams(query);
  const filter = storeFilter(user, 'm.store_id');
  const where = [];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  if (query.product_id) { where.push('m.product_id = ?'); params.push(Number(query.product_id)); }
  if (query.type) { where.push('m.type = ?'); params.push(query.type); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM stock_movements m ${clause}`, params);
  const [items] = await db.query(
    `SELECT m.*, p.code AS product_code, p.name AS product_name, p.unit
     FROM stock_movements m JOIN products p ON p.id = m.product_id
     ${clause} ORDER BY m.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return paged(items, total, page, pageSize);
}

/** 供 Agent / 看板使用：库存预警。 */
async function lowStock(db, user) {
  const filter = storeFilter(user, 'st.store_id');
  const where = ['st.qty <= st.safety_qty'];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  const [rows] = await db.query(
    `SELECT st.*, p.code AS product_code, p.name AS product_name, p.unit, s.name AS store_name
     FROM stocks st JOIN products p ON p.id = st.product_id
     LEFT JOIN stores s ON s.id = st.store_id
     WHERE ${where.join(' AND ')} ORDER BY (st.safety_qty - st.qty) DESC, st.id`,
    params
  );
  return rows;
}

module.exports = {
  listStocks, adjustStock, listIssues, createIssue, approveIssue, issueOut,
  returnMaterials, listMovements, lowStock,
};
