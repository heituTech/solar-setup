'use strict';

const { sendReports } = require('../../lib/reports');
const { currentPeriod, assertPeriod } = require('../../lib/rules');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPES = new Set(['personal', 'team', 'all']);

module.exports = {
  async listRecipients(ctx) {
    const [rows] = await ctx.app.db.query(
      'SELECT id, email, name, created_by, created_at FROM hrms_report_recipients ORDER BY id'
    );
    ctx.body = { recipients: rows.map((row) => ({ ...row, id: Number(row.id) })) };
  },

  async addRecipient(ctx) {
    const body = ctx.request.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) ctx.throw(400, 'invalid_email');
    const name = body.name ? String(body.name).slice(0, 120) : null;
    try {
      const [inserted] = await ctx.app.db.query(
        'INSERT INTO hrms_report_recipients (email, name, created_by) VALUES (?,?,?)',
        [email, name, Number(ctx.state.user.id)]
      );
      ctx.status = 201;
      ctx.body = { recipient: { id: Number(inserted.insertId), email, name } };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') ctx.throw(409, 'duplicate_email');
      throw error;
    }
  },

  async removeRecipient(ctx) {
    const id = Number(ctx.params.id);
    if (!id) ctx.throw(400, 'invalid_id');
    await ctx.app.db.query('DELETE FROM hrms_report_recipients WHERE id = ?', [id]);
    ctx.body = { ok: true };
  },

  async listLogs(ctx) {
    const period = ctx.query.period ? String(ctx.query.period) : null;
    if (period) assertPeriod(period);
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const where = [];
    const params = [];
    if (period) { where.push('period = ?'); params.push(period); }
    if (ctx.query.status) { where.push('status = ?'); params.push(String(ctx.query.status)); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[countRow]] = await ctx.app.db.query(
      `SELECT COUNT(*) AS total FROM hrms_report_logs ${clause}`, params
    );
    const [rows] = await ctx.app.db.query(
      `SELECT * FROM hrms_report_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    ctx.body = { total: Number(countRow.total || 0), page, page_size: pageSize, logs: rows };
  },

  async sendNow(ctx) {
    const body = ctx.request.body || {};
    const period = String(body.period || currentPeriod());
    assertPeriod(period);
    const type = String(body.type || 'all');
    if (!TYPES.has(type)) ctx.throw(400, 'invalid_report_type');
    const summary = await sendReports(ctx.app, { period, type });
    ctx.body = { summary };
  },
};
