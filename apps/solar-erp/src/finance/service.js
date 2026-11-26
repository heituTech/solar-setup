'use strict';

const { withTransaction } = require('../common/db');
const { nextCode, dayPeriod } = require('../common/codes');
const { record } = require('../common/audit');
const { badRequest, notFound, fail, money, str, pageParams, paged, today } = require('../common/http');
const { storeFilter } = require('../common/scope');
const projectService = require('../project/service');

/** 应收单：来源可为销售单定金或合同收款计划。 */
async function createReceivable(conn, data) {
  const [inserted] = await conn.query(
    `INSERT INTO receivables (project_id, store_id, source_type, source_id, name, amount, due_date, status)
     VALUES (?,?,?,?,?,?,?,?)`,
    [data.projectId || null, data.storeId || null, data.sourceType || 'payment_plan', data.sourceId || null,
      data.name, money(data.amount, 0), data.dueDate || null, data.status || 'pending']
  );
  return inserted.insertId;
}

/** 合同签订后，把收款计划同步为应收单。 */
async function createReceivablesForPlans(db, projectId) {
  const [plans] = await db.query('SELECT * FROM payment_plans WHERE project_id = ? ORDER BY seq', [projectId]);
  const [projects] = await db.query('SELECT store_id FROM projects WHERE id = ? LIMIT 1', [projectId]);
  const storeId = projects.length ? projects[0].store_id : null;
  return withTransaction(db, async (conn) => {
    const ids = [];
    for (const plan of plans) {
      const [exists] = await conn.query(
        "SELECT id FROM receivables WHERE source_type = 'payment_plan' AND source_id = ? LIMIT 1", [plan.id]
      );
      if (exists.length) { ids.push(exists[0].id); continue; }
      ids.push(await createReceivable(conn, {
        projectId, storeId, sourceType: 'payment_plan', sourceId: plan.id,
        name: plan.name, amount: plan.amount, dueDate: plan.due_date,
      }));
    }
    return ids;
  });
}

/** 销售单定金：直接生成一条已结清应收 + 收款流水。 */
async function createDepositReceipt(conn, data) {
  const amount = money(data.amount, 0);
  if (amount <= 0) return null;
  const receivableId = await createReceivable(conn, {
    projectId: data.projectId, storeId: data.storeId, sourceType: 'sales_order',
    sourceId: data.salesOrderId, name: '销售定金', amount, dueDate: today(), status: 'paid',
  });
  await conn.query('UPDATE receivables SET received_amount = ? WHERE id = ?', [amount, receivableId]);
  const receiptNo = await nextCode(conn, 'receipt', 'RC', { period: dayPeriod(), separator: '-', width: 4 });
  const [inserted] = await conn.query(
    `INSERT INTO receipts (receipt_no, project_id, sales_order_id, receivable_id, amount, method, received_at, status, remark, operator_id, operator_name)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [receiptNo, data.projectId || null, data.salesOrderId || null, receivableId, amount,
      data.method || 'bank', data.receivedAt || today(), 'confirmed', data.remark || '销售单定金',
      data.user ? data.user.id : null, data.user ? data.user.name : null]
  );
  await record(conn, {
    module: 'finance', entity: 'receipt', entityId: inserted.insertId, action: 'create',
    actor: { id: data.user ? data.user.id : null, name: data.user ? data.user.name : null },
    after: { receipt_no: receiptNo, amount, receivable_id: receivableId },
  });
  return { receiptId: inserted.insertId, receipt_no: receiptNo, receivableId };
}

async function listReceivables(db, query, user) {
  const { page, pageSize, offset } = pageParams(query);
  const filter = storeFilter(user, 'r.store_id');
  const where = [];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  if (query.status) { where.push('r.status = ?'); params.push(query.status); }
  if (query.project_id) { where.push('r.project_id = ?'); params.push(Number(query.project_id)); }
  if (query.overdue === '1') {
    where.push("r.status IN ('pending','partial') AND r.due_date < CURDATE()");
  }
  if (query.keyword) {
    where.push('(p.project_no LIKE ? OR p.customer_name LIKE ? OR r.name LIKE ?)');
    const like = `%${query.keyword}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM receivables r
     LEFT JOIN projects p ON p.id = r.project_id ${clause}`, params
  );
  const [items] = await db.query(
    `SELECT r.*, p.project_no, p.customer_name
     FROM receivables r LEFT JOIN projects p ON p.id = r.project_id
     ${clause} ORDER BY r.status IN ('pending','partial') DESC, r.due_date ASC, r.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return paged(items, total, page, pageSize);
}

/** 收款核销：部分/全额核销，全部结清后自动登记质保。 */
async function receive(db, payload, user) {
  const receivableId = Number(payload.receivable_id);
  const amount = money(payload.amount, 0);
  if (!receivableId) badRequest('receivable_required');
  if (amount <= 0) badRequest('invalid_amount');

  return withTransaction(db, async (conn) => {
    const [rows] = await conn.query('SELECT * FROM receivables WHERE id = ? FOR UPDATE', [receivableId]);
    if (!rows.length) notFound('receivable_not_found');
    const receivable = rows[0];
    if (receivable.status === 'paid') fail('receivable_already_paid', 409);
    const remaining = Math.round((Number(receivable.amount) - Number(receivable.received_amount)) * 100) / 100;
    if (amount - remaining > 0.001) {
      fail('over_receipt', 400, { remaining });
    }
    const receivedAmount = Math.round((Number(receivable.received_amount) + amount) * 100) / 100;
    const status = receivedAmount >= Number(receivable.amount) - 0.001 ? 'paid' : 'partial';
    await conn.query('UPDATE receivables SET received_amount = ?, status = ? WHERE id = ?', [receivedAmount, status, receivableId]);

    const receiptNo = await nextCode(conn, 'receipt', 'RC', { period: dayPeriod(), separator: '-', width: 4 });
    const [inserted] = await conn.query(
      `INSERT INTO receipts (receipt_no, project_id, receivable_id, amount, method, received_at, status, remark, operator_id, operator_name)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [receiptNo, receivable.project_id, receivableId, amount, payload.method || 'bank',
        str(payload.received_at, { max: 20 }) || today(), 'confirmed', str(payload.remark, { max: 255 }),
        user.id, user.name]
    );
    await record(conn, {
      module: 'finance', entity: 'receipt', entityId: inserted.insertId, action: 'create',
      actor: { id: user.id, name: user.name },
      after: { receipt_no: receiptNo, amount, receivable_id: receivableId, receivable_status: status },
    });

    let settled = null;
    if (receivable.project_id) {
      const [[{ open }]] = await conn.query(
        "SELECT COUNT(*) AS open FROM receivables WHERE project_id = ? AND status IN ('pending','partial')",
        [receivable.project_id]
      );
      if (Number(open) === 0) {
        settled = await projectService.markSettled(conn, receivable.project_id, { id: user.id, name: user.name });
      }
    }
    return { receipt_id: inserted.insertId, receipt_no: receiptNo, receivable_status: status, settled };
  });
}

async function listReceipts(db, query, user) {
  const { page, pageSize, offset } = pageParams(query);
  const filter = storeFilter(user, 'r.store_id');
  const where = [];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  if (query.project_id) { where.push('r.project_id = ?'); params.push(Number(query.project_id)); }
  if (query.keyword) {
    where.push('(r.receipt_no LIKE ? OR p.project_no LIKE ?)');
    params.push(`%${query.keyword}%`, `%${query.keyword}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM receipts r LEFT JOIN projects p ON p.id = r.project_id ${clause}`, params
  );
  const [items] = await db.query(
    `SELECT r.*, p.project_no, p.customer_name FROM receipts r
     LEFT JOIN projects p ON p.id = r.project_id ${clause} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return paged(items, total, page, pageSize);
}

async function addProjectCost(conn, data) {
  await conn.query(
    `INSERT INTO project_costs (project_id, type, amount, ref_type, ref_id, remark, created_by)
     VALUES (?,?,?,?,?,?,?)`,
    [data.projectId, data.type || 'material', money(data.amount, 0), data.refType || null,
      data.refId || null, data.remark || null, data.userId || null]
  );
}

async function getProjectFinance(db, projectId) {
  const [receivables] = await db.query('SELECT * FROM receivables WHERE project_id = ? ORDER BY id', [projectId]);
  const [receipts] = await db.query('SELECT * FROM receipts WHERE project_id = ? ORDER BY id DESC', [projectId]);
  const [costs] = await db.query('SELECT * FROM project_costs WHERE project_id = ? ORDER BY id DESC', [projectId]);
  const receivableTotal = receivables.reduce((sum, row) => sum + Number(row.amount), 0);
  const receivedTotal = receivables.reduce((sum, row) => sum + Number(row.received_amount), 0);
  const costTotal = costs.reduce((sum, row) => sum + Number(row.amount), 0);
  return {
    receivables,
    receipts,
    costs,
    totals: {
      receivable: Math.round(receivableTotal * 100) / 100,
      received: Math.round(receivedTotal * 100) / 100,
      outstanding: Math.round((receivableTotal - receivedTotal) * 100) / 100,
      cost: Math.round(costTotal * 100) / 100,
      profit: Math.round((receivedTotal - costTotal) * 100) / 100,
    },
  };
}

/** 供看板与 Agent 使用：待收款汇总（按数据范围）。 */
async function outstandingSummary(db, user) {
  const filter = storeFilter(user, 'r.store_id');
  const where = ["r.status IN ('pending','partial')"];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  const [rows] = await db.query(
    `SELECT r.*, p.project_no, p.customer_name, DATEDIFF(CURDATE(), r.due_date) AS overdue_days
     FROM receivables r LEFT JOIN projects p ON p.id = r.project_id
     WHERE ${where.join(' AND ')} ORDER BY r.due_date ASC, r.id ASC`,
    params
  );
  const total = rows.reduce((sum, row) => sum + (Number(row.amount) - Number(row.received_amount)), 0);
  return {
    items: rows,
    total: Math.round(total * 100) / 100,
    overdue: rows.filter((row) => Number(row.overdue_days) > 0),
  };
}

async function todayReceiptsSummary(db, user) {
  const filter = storeFilter(user, 'r.store_id');
  const where = ['DATE(r.created_at) = CURDATE()'];
  const params = [];
  if (filter.sql) { where.push(filter.sql); params.push(...filter.params); }
  const [[row]] = await db.query(
    `SELECT COALESCE(SUM(r.amount), 0) AS amount, COUNT(*) AS count FROM receipts r
     WHERE ${where.join(' AND ')}`, params
  );
  return { amount: Number(row.amount), count: Number(row.count) };
}

module.exports = {
  createReceivable, createReceivablesForPlans, createDepositReceipt,
  listReceivables, receive, listReceipts,
  addProjectCost, getProjectFinance, outstandingSummary, todayReceiptsSummary,
};
