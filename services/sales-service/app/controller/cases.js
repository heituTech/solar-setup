'use strict';

const crypto = require('crypto');

function toCase(row) {
  return {
    ...row,
    id: Number(row.id),
    member_id: Number(row.member_id),
    snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
  };
}

module.exports = {
  async list(ctx) {
    const user = ctx.state.user;
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    const status = String(ctx.query.status || '').trim();
    const conditions = [];
    const params = [];
    if (user.role === 'member') {
      conditions.push('member_id = ?');
      params.push(Number(user.id));
    }
    if (q) {
      conditions.push('title LIKE ?');
      params.push(`%${q}%`);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const [countRows] = await ctx.app.db.query(`SELECT COUNT(*) AS total FROM cases${where}`, params);
    const offset = (page - 1) * pageSize;
    const [rows] = await ctx.app.db.query(
      `SELECT * FROM cases${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    ctx.body = { cases: rows.map(toCase), total: Number(countRows[0].total), page, page_size: pageSize };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const title = String(body.title || '').trim();
    if (!title) ctx.throw(400, 'title_required');
    const [result] = await ctx.app.db.query(
      'INSERT INTO cases (member_id, title, snapshot, status, share_token) VALUES (?,?,?,?,?)',
      [Number(ctx.state.user.id), title, JSON.stringify(body.snapshot || {}), 'active', crypto.randomUUID().replace(/-/g, '')]
    );
    const [rows] = await ctx.app.db.query('SELECT * FROM cases WHERE id = ?', [result.insertId]);
    ctx.status = 201;
    ctx.body = { case: toCase(rows[0]) };
  },

  async remove(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM cases WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'case_not_found');
    if (ctx.state.user.role !== 'member' && ctx.state.user.role !== 'super_admin') ctx.throw(403, 'forbidden');
    if (ctx.state.user.role === 'member' && Number(rows[0].member_id) !== Number(ctx.state.user.id)) ctx.throw(403, 'forbidden');
    await ctx.app.db.query('DELETE FROM cases WHERE id = ?', [id]);
    ctx.body = { ok: true };
  },

  async shared(ctx) {
    const [rows] = await ctx.app.db.query('SELECT * FROM cases WHERE share_token = ?', [String(ctx.params.token)]);
    if (!rows.length) ctx.throw(404, 'case_not_found');
    ctx.body = { case: toCase(rows[0]) };
  },
};
