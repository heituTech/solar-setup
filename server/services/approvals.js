const pool = require('../db');
const catalog = require('./catalog');
const accounts = require('./accounts');

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parsePayload(value) {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

function sanitizeApproval(row) {
  const payload = parsePayload(row.payload);
  if (row.request_type && row.request_type.startsWith('account_') && 'password_hash' in payload) {
    delete payload.password_hash;
  }
  return { ...row, payload };
}

async function createRequest({ requesterId = null, requestType, approverRole, approverId = null, targetTable, targetId = null, payload, reason = null }, conn = pool) {
  if (targetId) {
    const [pending] = await conn.query(
      `SELECT id FROM approval_requests
       WHERE target_table = ? AND target_id = ? AND status = 'pending' LIMIT 1`,
      [targetTable, targetId]
    );
    if (pending.length) throw httpError('pending_request_exists', 409);
  }
  if (requestType === 'account_create' || requestType === 'account_register') {
    const username = String((payload && payload.username) || '').trim().toLowerCase();
    if (username) {
      const [pending] = await conn.query(
        `SELECT id FROM approval_requests
         WHERE request_type IN ('account_create', 'account_register') AND status = 'pending'
           AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.username')) = ?
         LIMIT 1`,
        [username]
      );
      if (pending.length) throw httpError('pending_request_exists', 409);
    }
  }
  const [result] = await conn.query(
    `INSERT INTO approval_requests
     (request_type, requester_id, approver_role, approver_id, target_table, target_id, payload, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [requestType, requesterId, approverRole, approverId, targetTable, targetId, JSON.stringify(payload || {}), reason]
  );
  return result.insertId;
}

async function applyRequest(conn, approval) {
  const payload = parsePayload(approval.payload);
  const table = approval.target_table;

  if (approval.request_type === 'product_create') {
    const category = catalog.categoryForTable(table);
    return catalog.createProduct(category, payload, conn);
  }
  if (approval.request_type === 'product_update') {
    const category = catalog.categoryForTable(table);
    return catalog.updateProduct(category, Number(approval.target_id), payload, conn);
  }
  if (approval.request_type === 'product_delete') {
    const category = catalog.categoryForTable(table);
    return catalog.deleteProduct(category, Number(approval.target_id), conn);
  }
  if (approval.request_type === 'account_create') {
    return accounts.createStaff(conn, payload, ['salesperson']);
  }
  if (approval.request_type === 'account_register') {
    const id = await accounts.createStaff(conn, payload, ['salesperson', 'sales_manager']);
    await conn.query('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [id]);
    return id;
  }
  if (approval.request_type === 'account_update') {
    return accounts.updateStaff(conn, Number(approval.target_id), payload, ['salesperson']);
  }
  if (approval.request_type === 'account_delete') {
    return accounts.deleteStaff(conn, Number(approval.target_id), ['salesperson']);
  }
  throw httpError('invalid_request_type');
}

module.exports = {
  httpError,
  parsePayload,
  sanitizeApproval,
  createRequest,
  applyRequest,
};
