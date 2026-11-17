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
    const params = [];
    let sql = 'SELECT * FROM cases';
    if (user.role === 'member') {
      sql += ' WHERE member_id = ?';
      params.push(Number(user.id));
    }
    sql += ' ORDER BY id DESC LIMIT 200';
    const [rows] = await ctx.app.db.query(sql, params);
    ctx.body = { cases: rows.map(toCase) };
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
