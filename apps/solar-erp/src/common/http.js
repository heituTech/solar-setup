'use strict';

/**
 * 公共 HTTP 工具：统一返回结构、分页、入参校验、业务错误码。
 */

function fail(code, status = 400, details) {
  const error = new Error(code);
  error.status = status;
  if (details !== undefined) error.details = details;
  throw error;
}

const badRequest = (code = 'invalid_request') => fail(code, 400);
const unauthorized = (code = 'unauthorized') => fail(code, 401);
const forbidden = (code = 'forbidden') => fail(code, 403);
const notFound = (code = 'not_found') => fail(code, 404);
const conflict = (code = 'conflict') => fail(code, 409);

function pageParams(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.page_size) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function paged(items, total, page, pageSize) {
  return { items, total: Number(total) || 0, page, page_size: pageSize };
}

function str(value, { required = false, max = 255, field = 'field' } = {}) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (required && !text) badRequest(`${field}_required`);
  if (text.length > max) badRequest(`${field}_too_long`);
  return text || null;
}

function money(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : fallback;
}

function qty(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) badRequest('invalid_quantity');
  return Math.round(num * 1000) / 1000;
}

function positiveInt(value, fallback = null) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : fallback;
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function actorOf(ctx) {
  const user = ctx.state.user || {};
  return { id: user.id || null, name: user.name || null };
}

module.exports = {
  fail, badRequest, unauthorized, forbidden, notFound, conflict,
  pageParams, paged, str, money, qty, positiveInt, today, actorOf,
};
