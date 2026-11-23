'use strict';

const { sendMail } = require('../../lib/mailer');

function toNotification(row) {
  return {
    ...row,
    id: Number(row.id),
    user_id: Number(row.user_id),
    is_read: Number(row.is_read) === 1,
  };
}

async function resolveTargets(db, userIds, roles) {
  const ors = [];
  const params = [];
  if (userIds.length) {
    ors.push(`id IN (${userIds.map(() => '?').join(',')})`);
    params.push(...userIds);
  }
  if (roles.length) {
    ors.push(`role IN (${roles.map(() => '?').join(',')})`);
    params.push(...roles);
  }
  if (!ors.length) return [];
  const [rows] = await db.query(
    `SELECT id, name, email, role FROM users
     WHERE status = 'active' AND role <> 'member' AND (${ors.join(' OR ')})
     ORDER BY id`,
    params
  );
  return rows;
}

module.exports = {
  async list(ctx) {
    const userId = Number(ctx.state.user.id);
    const unreadOnly = ['1', 'true'].includes(String(ctx.query.unread_only || ''));
    const params = [userId];
    let sql = 'FROM notifications WHERE user_id = ?';
    if (unreadOnly) sql += ' AND is_read = 0';
    const [rows] = await ctx.app.db.query(
      `SELECT * ${sql} ORDER BY id DESC LIMIT 50`, params
    );
    const [countRows] = await ctx.app.db.query(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0', [userId]
    );
    ctx.body = { notifications: rows.map(toNotification), unread: Number(countRows[0].total) };
  },

  async markRead(ctx) {
    const userId = Number(ctx.state.user.id);
    const body = ctx.request.body || {};
    if (body.all) {
      await ctx.app.db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
      ctx.body = { ok: true };
      return;
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
    if (!ids.length) ctx.throw(400, 'ids_required');
    await ctx.app.db.query(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      [userId, ...ids]
    );
    ctx.body = { ok: true };
  },

  async internalCreate(ctx) {
    const body = ctx.request.body || {};
    const title = String(body.title || '').trim();
    if (!title) ctx.throw(400, 'title_required');
    const userIds = Array.isArray(body.user_ids)
      ? body.user_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    const roles = Array.isArray(body.roles) ? body.roles.map(String).filter(Boolean) : [];
    const targets = await resolveTargets(ctx.app.db, userIds, roles);
    if (!targets.length) {
      ctx.body = { created: 0, emailed: 0 };
      return;
    }
    const type = String(body.type || 'system');
    const content = body.content === undefined ? null : String(body.content);
    const link = body.link ? String(body.link) : null;
    await ctx.app.db.query(
      `INSERT INTO notifications (user_id, type, title, content, link)
       VALUES ${targets.map(() => '(?,?,?,?,?)').join(',')}`,
      targets.flatMap((user) => [Number(user.id), type, title, content, link])
    );

    let emailed = 0;
    const mail = body.email || null;
    if (mail && (mail.subject || mail.text || mail.html)) {
      for (const user of targets) {
        if (!user.email) continue;
        try {
          await sendMail(ctx.app.config.mail, {
            to: user.email,
            subject: mail.subject || title,
            text: mail.text || content || title,
            html: mail.html || undefined,
          });
          emailed += 1;
        } catch (error) {
          ctx.logger.warn('[notifications] email failed for %s: %s', user.email, error.message);
        }
      }
    }
    ctx.body = { created: targets.length, emailed };
  },
};
