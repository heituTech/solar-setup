'use strict';

function num(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function salesScopeFor(user) {
  if (user.role === 'salesperson') return [Number(user.id)];
  if (user.role === 'sales_manager') {
    return [...new Set([Number(user.id), ...(user.salesperson_ids || []).map(Number)])];
  }
  return null;
}

function scopeClause(column, scope, params) {
  if (scope === null) return '';
  if (!scope.length) return ' AND 1 = 0';
  params.push(...scope);
  return ` AND ${column} IN (${scope.map(() => '?').join(',')})`;
}

function toLedger(row) {
  const commissionAmount = num(row.commission_amount);
  const paidCommission = num(row.paid_commission);
  return {
    ...row,
    id: Number(row.id),
    order_id: Number(row.order_id),
    customer_id: Number(row.customer_id),
    salesperson_id: row.salesperson_id ? Number(row.salesperson_id) : null,
    order_amount: num(row.order_amount),
    received_amount: num(row.received_amount),
    outstanding: num(row.outstanding),
    commission_rate: num(row.commission_rate),
    commission_amount: commissionAmount,
    commission_due: num(row.commission_due),
    deposit_amount: num(row.deposit_amount),
    deposit_received: Number(row.deposit_received || 0),
    balance_amount: num(row.balance_amount),
    balance_received: Number(row.balance_received || 0),
    deposit_commission: num(row.deposit_commission),
    settlement_commission: num(row.settlement_commission),
    paid_commission: paidCommission,
    pending_commission: Math.round((commissionAmount - paidCommission) * 100) / 100,
    referral_flag: Number(row.referral_flag || 0),
  };
}

function periodOf(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = { num, salesScopeFor, scopeClause, toLedger, periodOf };
