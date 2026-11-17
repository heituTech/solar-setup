'use strict';

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

function num(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

module.exports = { salesScopeFor, scopeClause, num, parseJson };
