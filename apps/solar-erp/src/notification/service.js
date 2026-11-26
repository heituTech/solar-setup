'use strict';

const { pageParams, paged, notFound } = require('../common/http');

/**
 * 站内消息 + 可选企业微信/飞书外发。
 * 按角色广播时先展开成具体账号，保证「已读」状态互不影响。
 */
async function resolveUserIds(app, { userIds = [], roles = [], storeId = null }) {
  const ids = new Set(userIds.filter(Boolean).map(Number));
  if (roles.length) {
    const params = [...roles];
    let sql = `SELECT id FROM users WHERE status = 'active' AND role IN (${roles.map(() => '?').join(',')})`;
    if (storeId) { sql += ' AND store_id = ?'; params.push(Number(storeId)); }
    const [rows] = await app.db.query(sql, params);
    for (const row of rows) ids.add(Number(row.id));
  }
  return [...ids];
}

async function pushExternal(app, text) {
  const { wecom, feishu } = app.config.erp.notify || {};
  const jobs = [];
  if (wecom) {
    jobs.push(fetch(wecom, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
      signal: AbortSignal.timeout(5000),
    }));
  }
  if (feishu) {
    jobs.push(fetch(feishu, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text } }),
      signal: AbortSignal.timeout(5000),
    }));
  }
  if (!jobs.length) return;
  const results = await Promise.allSettled(jobs);
  for (const result of results) {
    if (result.status === 'rejected') app.logger.warn('notify webhook failed: %s', result.reason && result.reason.message);
  }
}

async function dispatch(app, payload) {
  const {
    userIds = [], roles = [], storeId = null,
    title, content, type = 'system', bizType = null, bizId = null, pushExternal: external = false,
  } = payload;
  const targets = await resolveUserIds(app, { userIds, roles, storeId });
  if (!targets.length) return { sent: 0 };
  const values = targets.map((id) => [id, null, title, content || '', type, bizType, bizId, 'internal']);
  await app.db.query(
    `INSERT INTO notifications (user_id, role, title, content, type, biz_type, biz_id, channel) VALUES
     ${values.map(() => '(?,?,?,?,?,?,?,?)').join(',')}`,
    values.flat()
  );
  if (external) pushExternal(app, `【${title}】\n${content || ''}`).catch(() => {});
  return { sent: targets.length };
}

async function list(app, user, query = {}) {
  const { page, pageSize, offset } = pageParams(query);
  const where = ['user_id = ?'];
  const params = [user.id];
  if (query.unread === '1') where.push('is_read = 0');
  if (query.type) { where.push('type = ?'); params.push(query.type); }
  const clause = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await app.db.query(`SELECT COUNT(*) AS total FROM notifications ${clause}`, params);
  const [items] = await app.db.query(
    `SELECT * FROM notifications ${clause} ORDER BY is_read ASC, id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  return paged(items, total, page, pageSize);
}

async function unreadCount(app, user) {
  const [[row]] = await app.db.query('SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0', [user.id]);
  return Number(row.total);
}

async function markRead(app, user, id) {
  const [result] = await app.db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, user.id]);
  if (!result.affectedRows) notFound('notification_not_found');
  return { id: Number(id), is_read: 1 };
}

async function markAllRead(app, user) {
  const [result] = await app.db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [user.id]);
  return { updated: result.affectedRows };
}

module.exports = { dispatch, list, unreadCount, markRead, markAllRead, resolveUserIds };
