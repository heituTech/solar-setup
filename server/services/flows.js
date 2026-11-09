const pool = require('../db');

const REQUEST_TYPES = [
  'product_create',
  'product_update',
  'product_delete',
  'account_create',
  'account_update',
  'account_delete',
  'account_register',
];
const REQUESTER_ROLES = ['salesperson', 'sales_manager'];
const APPROVER_ROLES = ['super_admin', 'sales_manager'];

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function toFlag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return Number(value) ? 1 : 0;
}

function validate(data, existing = null) {
  const merged = {
    name: data.name !== undefined ? String(data.name).trim() : (existing ? existing.name : ''),
    request_type: data.request_type !== undefined ? data.request_type : (existing ? existing.request_type : ''),
    requester_role: data.requester_role !== undefined ? data.requester_role : (existing ? existing.requester_role : ''),
    approver_role: data.approver_role !== undefined ? data.approver_role : (existing ? existing.approver_role : ''),
    require_approval: toFlag(data.require_approval, existing ? Number(existing.require_approval) : 1),
    enabled: toFlag(data.enabled, existing ? Number(existing.enabled) : 1),
  };
  if (!merged.name) throw httpError('flow_name_required');
  if (!REQUEST_TYPES.includes(merged.request_type)) throw httpError('invalid_request_type');
  if (!REQUESTER_ROLES.includes(merged.requester_role)) throw httpError('invalid_requester_role');
  if (!APPROVER_ROLES.includes(merged.approver_role)) throw httpError('invalid_approver_role');
  merged.name = merged.name.slice(0, 100);
  // Registrations follow fixed rules: salesperson registrations are reviewed by
  // the chosen sales manager, sales manager registrations by a super admin.
  if (merged.request_type === 'account_register') {
    if (merged.requester_role === 'salesperson' && merged.approver_role !== 'sales_manager') {
      throw httpError('invalid_approver_role');
    }
    if (merged.requester_role === 'sales_manager' && merged.approver_role !== 'super_admin') {
      throw httpError('invalid_approver_role');
    }
  }
  return merged;
}

async function listFlows() {
  const [rows] = await pool.query(
    `SELECT * FROM approval_flows
     ORDER BY FIELD(request_type, ${REQUEST_TYPES.map(() => '?').join(',')}), requester_role, id`,
    REQUEST_TYPES
  );
  return rows;
}

async function createFlow(data) {
  const flow = validate(data);
  try {
    const [result] = await pool.query(
      `INSERT INTO approval_flows (name, request_type, requester_role, approver_role, require_approval, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [flow.name, flow.request_type, flow.requester_role, flow.approver_role, flow.require_approval, flow.enabled]
    );
    return result.insertId;
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') throw httpError('flow_exists', 409);
    throw e;
  }
}

async function updateFlow(id, data) {
  const [rows] = await pool.query('SELECT * FROM approval_flows WHERE id = ?', [id]);
  const existing = rows[0];
  if (!existing) throw httpError('flow_not_found', 404);
  const flow = validate(data, existing);
  try {
    await pool.query(
      `UPDATE approval_flows
       SET name = ?, request_type = ?, requester_role = ?, approver_role = ?, require_approval = ?, enabled = ?
       WHERE id = ?`,
      [flow.name, flow.request_type, flow.requester_role, flow.approver_role, flow.require_approval, flow.enabled, id]
    );
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') throw httpError('flow_exists', 409);
    throw e;
  }
  return true;
}

async function deleteFlow(id) {
  const [result] = await pool.query('DELETE FROM approval_flows WHERE id = ?', [id]);
  if (!result.affectedRows) throw httpError('flow_not_found', 404);
  return true;
}

async function getFlow(requestType, requesterRole, conn = pool) {
  const [rows] = await conn.query(
    'SELECT * FROM approval_flows WHERE request_type = ? AND requester_role = ? LIMIT 1',
    [requestType, requesterRole]
  );
  return rows[0] || null;
}

// Resolve how a request from the given role should be handled.
// Missing or disabled flow means the request takes effect directly.
async function routeRequest(requestType, requesterRole, conn = pool) {
  const flow = await getFlow(requestType, requesterRole, conn);
  if (!flow || !Number(flow.enabled) || !Number(flow.require_approval)) {
    return { requireApproval: false, approverRole: null };
  }
  return { requireApproval: true, approverRole: flow.approver_role };
}

module.exports = {
  REQUEST_TYPES,
  REQUESTER_ROLES,
  APPROVER_ROLES,
  httpError,
  listFlows,
  createFlow,
  updateFlow,
  deleteFlow,
  getFlow,
  routeRequest,
};
