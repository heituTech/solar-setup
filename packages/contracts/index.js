'use strict';

const ROLES = Object.freeze([
  'super_admin', 'sales_manager', 'salesperson', 'electrical_engineer',
  'structural_engineer', 'warehouse', 'accountant', 'after_sales', 'after_sales_manager', 'member',
]);
const STAFF_ROLES = Object.freeze(ROLES.filter((role) => role !== 'member'));
const SALES_ROLES = Object.freeze(['super_admin', 'sales_manager', 'salesperson']);
const EVENTS = Object.freeze({
  USER_CHANGED: 'UserChanged',
  ORDER_CONVERTED: 'OrderConverted',
  SURVEY_REVIEWED: 'SurveyReviewed',
  PROJECT_ACCEPTED: 'ProjectAccepted',
  PROJECT_PROGRESS_CHANGED: 'ProjectProgressChanged',
  TICKET_CHANGED: 'TicketChanged',
  PAYMENT_CHANGED: 'PaymentChanged',
  PAYOUT_CHANGED: 'PayoutChanged',
  SETTLEMENT_CHANGED: 'SettlementChanged',
  APPROVAL_DECIDED: 'ApprovalDecided',
});
const DESTINATIONS = Object.freeze({
  identity: 'identity',
  sales: 'sales',
  delivery: 'delivery',
  finance: 'finance',
});
const ORDER_STATUSES = Object.freeze(['initializing', 'pending_assignment', 'in_delivery', 'accepted', 'cancelled']);
const QUOTE_STATUSES = Object.freeze(['draft', 'pending_review', 'approved', 'accepted', 'converted', 'rejected']);

function httpError(status, code, details) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function requireFields(value, fields) {
  for (const field of fields) {
    if (value[field] === undefined || value[field] === null || value[field] === '') {
      throw httpError(400, `${field}_required`);
    }
  }
}

module.exports = {
  ROLES, STAFF_ROLES, SALES_ROLES, EVENTS, DESTINATIONS, ORDER_STATUSES,
  QUOTE_STATUSES, httpError, requireFields,
};
