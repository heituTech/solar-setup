'use strict';

/**
 * 统一编号规范（为将来 MDM 拆出预留）：
 *   ST0001        门店
 *   PRD0001       产品
 *   SUP0001       供应商
 *   ENG0001       工程师
 *   CRW0001       班组
 *   CUS0001       客户
 *   PJ202611-0001 项目（按月）
 *   SO20261126-0001 销售单（按日）
 * 其余单据同理，格式为「前缀 + 期间 + 序号」。
 */

function pad(value, width) {
  return String(value).padStart(width, '0');
}

function dayPeriod(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}

function monthPeriod(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}`;
}

async function nextCode(conn, name, prefix, { period = 'ALL', width = 4, separator = '' } = {}) {
  await conn.query(
    'INSERT INTO sys_sequences (name, period, seq_value) VALUES (?,?,1) ON DUPLICATE KEY UPDATE seq_value = seq_value + 1',
    [name, period]
  );
  const [[row]] = await conn.query('SELECT seq_value FROM sys_sequences WHERE name = ? AND period = ?', [name, period]);
  const middle = period === 'ALL' ? '' : `${period}${separator}`;
  return `${prefix}${middle}${pad(row.seq_value, width)}`;
}

module.exports = { nextCode, dayPeriod, monthPeriod };
