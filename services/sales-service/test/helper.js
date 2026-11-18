'use strict';

/**
 * 测试辅助：构造 mock ctx + mock db
 * 不依赖真实数据库，纯内存模拟 query 返回与调用记录
 */

function throwError(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

/**
 * 创建 mock db
 * @param {Array<{match: RegExp|string|Function, return: any}>} rules - 按顺序匹配 SQL 返回结果
 *   match 为 Function 时签名为 (sql, params) => boolean
 *   return 可以是任意值（模拟 rows）或函数（接收 (params, sql) 返回 rows）
 * @returns {{ query: Function, calls: Array }}
 */
function mockDb(rules = []) {
  const calls = [];
  async function query(sql, params = []) {
    calls.push({ sql, params });
    for (const rule of rules) {
      let matched = false;
      if (typeof rule.match === 'function') {
        matched = rule.match(sql, params);
      } else if (typeof rule.match === 'string') {
        matched = sql.includes(rule.match);
      } else {
        matched = rule.match.test(sql);
      }
      if (matched) {
        const ret = typeof rule.return === 'function' ? rule.return(params, sql) : rule.return;
        // Egg db.query 返回 [rows, fields]，这里只返回 [rows]。
        // rule.return 即 rows 本身（SELECT 时为行数组，INSERT 时为 ResultHeader 对象）
        return [ret];
      }
    }
    // 默认返回空结果
    return [[]];
  }
  // 支持事务：getConnection 返回一个共享 query 规则的 connection
  const connection = {
    query,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { query, calls, getConnection: async () => connection };
}

/**
 * 创建 mock ctx
 * @param {object} opts
 * @param {object} opts.user - ctx.state.user
 * @param {object} opts.params - ctx.params
 * @param {object} opts.body - ctx.request.body
 * @param {object} opts.query - ctx.query
 * @param {object} opts.db - mock db
 */
function mockCtx({ user = { id: 1, role: 'super_admin', name: 'Tester' }, params = {}, body = {}, query = {}, db = mockDb() } = {}) {
  let bodyValue = undefined;
  let statusValue = 200;
  const ctx = {
    state: { user, requestId: 'test-req-' + Date.now() },
    params,
    query,
    request: { body },
    app: { db },
    get body() { return bodyValue; },
    set body(v) { bodyValue = v; },
    get status() { return statusValue; },
    set status(v) { statusValue = v; },
    throw: throwError,
  };
  return ctx;
}

/**
 * 断言 ctx.throw 被调用，返回抛出的错误
 */
async function expectThrow(fn, status, message) {
  try {
    await fn();
  } catch (err) {
    if (status !== undefined && err.status !== status) {
      throw new Error(`期望 status=${status}，实际 ${err.status}（${err.message}）`);
    }
    if (message !== undefined && err.message !== message) {
      throw new Error(`期望 message=${message}，实际 ${err.message}`);
    }
    return err;
  }
  throw new Error('期望抛出错误但没有抛出');
}

module.exports = { mockDb, mockCtx, expectThrow };
