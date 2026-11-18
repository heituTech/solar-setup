'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mockDb, mockCtx, expectThrow } = require('./helper');
const quotes = require('../app/controller/quotes');

const adminUser = { id: 83, role: 'super_admin', name: 'Super Admin' };

const validItems = [
  { name: '单晶硅光伏板 550W', qty: 10, unit_price: 105 },
  { name: '并网逆变器 5kW', qty: 1, unit_price: 680 },
];

function customerRow(ownerId = 83) {
  return [{ id: 1, name: 'X Cafe', owner_id: ownerId, address: 'Boeng Tuk' }];
}

// ===================== assertSuggestedPrice（通过 create 间接测试）=====================

test('quotes.create - 建议价 ≠ 总造价 且无差异原因 → 400', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM customers WHERE id = ?', return: customerRow() },
  ]);
  const ctx = mockCtx({ user: adminUser, db, body: {
    customer_id: 1, items: validItems, system_total: 4605, suggested_price: 5000,
  } });
  await expectThrow(() => quotes.create(ctx), 400, 'diff_reason_required');
});

test('quotes.create - 建议价 ≠ 总造价 且有差异原因 → 成功', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM customers WHERE id = ?', return: customerRow() },
    { match: 'INSERT INTO quotes', return: { insertId: 1 } },
    { match: 'SELECT * FROM quotes WHERE id = ?', return: (params) => [{
      id: params[0], quote_no: 'Q-TEST', customer_id: 1, salesperson_id: 83, status: 'draft',
      currency: 'USD', items: JSON.stringify(validItems), total_amount: 1730, notes: null,
      system_total: 4605, suggested_price: 5000, diff_reason: '含税含运维',
      created_at: '2026-01-01', updated_at: '2026-01-01',
    }] },
  ]);
  const ctx = mockCtx({ user: adminUser, db, body: {
    customer_id: 1, items: validItems, system_total: 4605, suggested_price: 5000, diff_reason: '含税含运维',
  } });
  await quotes.create(ctx);
  assert.equal(ctx.status, 201);
  assert.equal(ctx.body.quote.system_total, 4605);
  assert.equal(ctx.body.quote.suggested_price, 5000);
  assert.equal(ctx.body.quote.diff_reason, '含税含运维');
});

test('quotes.create - 建议价 = 总造价 无需差异原因 → 成功', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM customers WHERE id = ?', return: customerRow() },
    { match: 'INSERT INTO quotes', return: { insertId: 2 } },
    { match: 'SELECT * FROM quotes WHERE id = ?', return: (params) => [{
      id: params[0], quote_no: 'Q-TEST2', customer_id: 1, salesperson_id: 83, status: 'draft',
      currency: 'USD', items: JSON.stringify(validItems), total_amount: 1730, notes: null,
      system_total: 1730, suggested_price: 1730, diff_reason: null,
      created_at: '2026-01-01', updated_at: '2026-01-01',
    }] },
  ]);
  const ctx = mockCtx({ user: adminUser, db, body: {
    customer_id: 1, items: validItems, system_total: 1730, suggested_price: 1730,
  } });
  await quotes.create(ctx);
  assert.equal(ctx.status, 201);
  assert.equal(ctx.body.quote.suggested_price, 1730);
  assert.equal(ctx.body.quote.diff_reason, null);
});

test('quotes.create - 建议价为 null（不填）无需差异原因 → 成功', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM customers WHERE id = ?', return: customerRow() },
    { match: 'INSERT INTO quotes', return: { insertId: 3 } },
    { match: 'SELECT * FROM quotes WHERE id = ?', return: (params) => [{
      id: params[0], quote_no: 'Q-TEST3', customer_id: 1, salesperson_id: 83, status: 'draft',
      currency: 'USD', items: JSON.stringify(validItems), total_amount: 1730, notes: null,
      system_total: 1730, suggested_price: null, diff_reason: null,
      created_at: '2026-01-01', updated_at: '2026-01-01',
    }] },
  ]);
  const ctx = mockCtx({ user: adminUser, db, body: {
    customer_id: 1, items: validItems, system_total: 1730,
  } });
  await quotes.create(ctx);
  assert.equal(ctx.status, 201);
  assert.equal(ctx.body.quote.suggested_price, null);
});

test('quotes.create - 差异原因为空白字符串仍抛 400', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM customers WHERE id = ?', return: customerRow() },
  ]);
  const ctx = mockCtx({ user: adminUser, db, body: {
    customer_id: 1, items: validItems, system_total: 4605, suggested_price: 5000, diff_reason: '   ',
  } });
  await expectThrow(() => quotes.create(ctx), 400, 'diff_reason_required');
});

test('quotes.create - 缺少 items 抛 400', async () => {
  const db = mockDb([{ match: 'SELECT * FROM customers', return: customerRow() }]);
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 1, items: [] } });
  await expectThrow(() => quotes.create(ctx), 400, 'items_required');
});

test('quotes.create - 客户不存在抛 404', async () => {
  const db = mockDb([{ match: 'SELECT * FROM customers', return: [] }]);
  const ctx = mockCtx({ user: adminUser, db, body: { customer_id: 999, items: validItems } });
  await expectThrow(() => quotes.create(ctx), 404, 'customer_not_found');
});

// ===================== approve =====================

test('quotes.approve - 非法 decision 抛 400', async () => {
  const db = mockDb([]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db, body: { decision: 'maybe' } });
  await expectThrow(() => quotes.approve(ctx), 400, 'invalid_decision');
});

test('quotes.approve - 报价不存在抛 404', async () => {
  const db = mockDb([{ match: 'SELECT * FROM quotes WHERE id = ?', return: [] }]);
  const ctx = mockCtx({ user: adminUser, params: { id: 999 }, db, body: { decision: 'approved' } });
  await expectThrow(() => quotes.approve(ctx), 404, 'quote_not_found');
});

test('quotes.approve - 非 pending_review 状态抛 409', async () => {
  const db = mockDb([{ match: 'SELECT * FROM quotes WHERE id = ?', return: [{ id: 1, status: 'draft' }] }]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db, body: { decision: 'approved' } });
  await expectThrow(() => quotes.approve(ctx), 409, 'quote_not_pending_review');
});

test('quotes.approve - 通过审批', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM quotes WHERE id = ?', return: [{ id: 1, status: 'pending_review' }] },
    { match: 'UPDATE quotes SET status', return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db, body: { decision: 'approved' } });
  await quotes.approve(ctx);
  assert.deepEqual(ctx.body, { id: 1, status: 'approved' });
});

test('quotes.approve - 驳回', async () => {
  const db = mockDb([
    { match: 'SELECT * FROM quotes WHERE id = ?', return: [{ id: 1, status: 'pending_review' }] },
    { match: 'UPDATE quotes SET status', return: [{ affectedRows: 1 }] },
  ]);
  const ctx = mockCtx({ user: adminUser, params: { id: 1 }, db, body: { decision: 'rejected' } });
  await quotes.approve(ctx);
  assert.deepEqual(ctx.body, { id: 1, status: 'rejected' });
});
