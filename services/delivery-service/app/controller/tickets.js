'use strict';

const { withTransaction, enqueueEvent, internalFetch } = require('@solar/service-kit');
const { EVENTS } = require('@solar/contracts');

const STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const DEFAULT_STAKEHOLDER_ROLES = ['super_admin', 'after_sales_manager'];

function toTicket(row) {
  return {
    ...row,
    id: Number(row.id),
    project_id: row.project_id ? Number(row.project_id) : null,
    order_id: row.order_id ? Number(row.order_id) : null,
    customer_id: row.customer_id ? Number(row.customer_id) : null,
    assignee_id: row.assignee_id ? Number(row.assignee_id) : null,
    created_by: row.created_by ? Number(row.created_by) : null,
  };
}

function toStakeholder(row) {
  return {
    ...row,
    id: Number(row.id),
    ticket_id: Number(row.ticket_id),
    user_id: Number(row.user_id),
  };
}

async function loadContacts(ctx) {
  const base = ctx.app.config && ctx.app.config.internal && ctx.app.config.internal.services
    && ctx.app.config.internal.services.identity;
  if (!base) return [];
  try {
    const data = await internalFetch(`${base}/internal/users/contacts`, {
      service: ctx.app.config.serviceName,
      method: 'POST',
      body: {},
    });
    return Array.isArray(data.users) ? data.users.filter((user) => user.status === 'active') : [];
  } catch (error) {
    ctx.logger.warn('[tickets] load contacts failed: %s', error.message);
    return [];
  }
}

function defaultStakeholders(contacts, project) {
  const map = new Map();
  for (const user of contacts) {
    if (!DEFAULT_STAKEHOLDER_ROLES.includes(user.role)) continue;
    map.set(Number(user.id), { user_id: Number(user.id), user_name: user.name, role: user.role });
  }
  if (project) {
    if (project.electrical_engineer_id) {
      map.set(Number(project.electrical_engineer_id), {
        user_id: Number(project.electrical_engineer_id),
        user_name: project.electrical_engineer_name || null,
        role: 'electrical_engineer',
      });
    }
    if (project.structural_engineer_id) {
      map.set(Number(project.structural_engineer_id), {
        user_id: Number(project.structural_engineer_id),
        user_name: project.structural_engineer_name || null,
        role: 'structural_engineer',
      });
    }
  }
  return [...map.values()];
}

async function notifyAfterSalesManagers(ctx, { ticket, orderNo, actorName }) {
  const base = ctx.app.config && ctx.app.config.internal && ctx.app.config.internal.services
    && ctx.app.config.internal.services.identity;
  if (!base) return;
  const subject = `新售后工单：${ticket.title}`;
  const text = `工单 #${ticket.id}（${ticket.title}）已创建。\n订单：${orderNo || '-'}\n创建人：${actorName || '-'}\n请登录系统查看并分派干系人。`;
  const html = `<p>工单 <strong>#${ticket.id}</strong>（${ticket.title}）已创建。</p>`
    + `<p>订单：${orderNo || '-'}<br/>创建人：${actorName || '-'}</p>`
    + '<p>请登录系统查看并分派干系人。</p>';
  try {
    await internalFetch(`${base}/internal/notifications`, {
      service: ctx.app.config.serviceName,
      body: {
        roles: ['after_sales_manager'],
        title: subject,
        content: text,
        type: 'ticket',
        link: '/workbench/tickets',
        email: { subject, text, html },
      },
    });
  } catch (error) {
    ctx.logger.warn('[tickets] notify failed: %s', error.message);
  }
}

async function notifyAddedStakeholders(ctx, { ticket, added, actorName }) {
  const base = ctx.app.config && ctx.app.config.internal && ctx.app.config.internal.services
    && ctx.app.config.internal.services.identity;
  if (!base || !added.length) return;
  try {
    await internalFetch(`${base}/internal/notifications`, {
      service: ctx.app.config.serviceName,
      body: {
        user_ids: added.map((item) => item.user_id),
        title: `工单协作：${ticket.title}`,
        content: `你已被添加为工单 #${ticket.id}（${ticket.title}）的干系人。\n订单：${ticket.order_no || '-'}\n操作人：${actorName || '-'}`,
        type: 'ticket',
        link: '/workbench/tickets',
      },
    });
  } catch (error) {
    ctx.logger.warn('[tickets] notify stakeholders failed: %s', error.message);
  }
}

module.exports = {
  async list(ctx) {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 10));
    const q = String(ctx.query.q || '').trim();
    const params = [];
    let sql = 'FROM tickets WHERE 1 = 1';
    if (ctx.query.status) { sql += ' AND status = ?'; params.push(String(ctx.query.status)); }
    if (ctx.query.priority) { sql += ' AND priority = ?'; params.push(String(ctx.query.priority)); }
    if (ctx.query.project_id) { sql += ' AND project_id = ?'; params.push(Number(ctx.query.project_id)); }
    if (ctx.query.order_id) { sql += ' AND order_id = ?'; params.push(Number(ctx.query.order_id)); }
    if (q) {
      sql += ' AND (title LIKE ? OR description LIKE ? OR customer_name LIKE ? OR order_no LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    const [rows] = await ctx.app.db.query(
      `SELECT * ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    const [count] = await ctx.app.db.query(`SELECT COUNT(*) AS total ${sql}`, params);
    ctx.body = { tickets: rows.map(toTicket), total: Number(count[0].total), page, page_size: pageSize };
  },

  async detail(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'ticket_not_found');
    const [stakeholders] = await ctx.app.db.query(
      'SELECT * FROM ticket_stakeholders WHERE ticket_id = ? ORDER BY id', [id]
    );
    ctx.body = { ticket: toTicket(rows[0]), stakeholders: stakeholders.map(toStakeholder) };
  },

  async create(ctx) {
    const body = ctx.request.body || {};
    const title = String(body.title || '').trim();
    if (!title) ctx.throw(400, 'title_required');
    const orderId = Number(body.order_id);
    if (!Number.isInteger(orderId) || orderId <= 0) ctx.throw(400, 'order_required');
    const [projectRows] = await ctx.app.db.query('SELECT * FROM projects WHERE order_id = ?', [orderId]);
    const project = projectRows[0] || null;
    const priority = body.priority || 'normal';
    if (!PRIORITIES.has(priority)) ctx.throw(400, 'invalid_priority');
    const customerId = body.customer_id ? Number(body.customer_id) : (project ? Number(project.customer_id) : null);
    const customerName = body.customer_name || (project ? project.customer_name : null);
    const orderNo = body.order_no || (project ? project.order_no : null);
    const contacts = await loadContacts(ctx);
    const stakeholders = defaultStakeholders(contacts, project);
    const actorName = ctx.state.user.name || null;

    const ticket = await withTransaction(ctx.app.db, async (connection) => {
      const [result] = await connection.query(
        `INSERT INTO tickets (project_id, order_id, order_no, customer_id, customer_name, title, description,
           priority, status, assignee_id, assignee_name, created_by, created_by_name)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [project ? Number(project.id) : null, orderId, orderNo, customerId, customerName,
          title, body.description || null, priority, 'open',
          body.assignee_id ? Number(body.assignee_id) : null, body.assignee_name || null,
          Number(ctx.state.user.id), actorName]
      );
      const ticketId = result.insertId;
      if (stakeholders.length) {
        await connection.query(
          `INSERT INTO ticket_stakeholders (ticket_id, user_id, user_name, role)
           VALUES ${stakeholders.map(() => '(?,?,?,?)').join(',')}`,
          stakeholders.flatMap((item) => [ticketId, item.user_id, item.user_name, item.role])
        );
      }
      await enqueueEvent(connection, {
        type: EVENTS.TICKET_CHANGED,
        aggregateId: ticketId,
        customerId: customerId || null,
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales'],
        payload: { ticket_id: Number(ticketId), order_id: orderId, status: 'open', title },
      });
      const [rows] = await connection.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
      return rows[0];
    });
    await notifyAfterSalesManagers(ctx, { ticket: toTicket(ticket), orderNo, actorName });
    ctx.status = 201;
    ctx.body = { ticket: toTicket(ticket), stakeholders };
  },

  async update(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'ticket_not_found');
    const body = ctx.request.body || {};
    if (body.status && !STATUSES.has(String(body.status))) ctx.throw(400, 'invalid_status');
    const ticket = await withTransaction(ctx.app.db, async (connection) => {
      const assignments = [];
      const params = [];
      for (const field of ['status', 'resolution', 'assignee_name']) {
        if (body[field] !== undefined) { assignments.push(`${field} = ?`); params.push(body[field]); }
      }
      if (body.assignee_id !== undefined) {
        assignments.push('assignee_id = ?');
        params.push(body.assignee_id ? Number(body.assignee_id) : null);
      }
      if (!assignments.length) ctx.throw(400, 'no_fields');
      params.push(id);
      await connection.query(`UPDATE tickets SET ${assignments.join(', ')} WHERE id = ?`, params);
      await enqueueEvent(connection, {
        type: EVENTS.TICKET_CHANGED,
        aggregateId: id,
        customerId: rows[0].customer_id ? Number(rows[0].customer_id) : null,
        actorId: ctx.state.user.id,
        requestId: ctx.state.requestId,
        destinations: ['sales'],
        payload: { ticket_id: id, order_id: rows[0].order_id ? Number(rows[0].order_id) : null, status: body.status || rows[0].status },
      });
      const [fresh] = await connection.query('SELECT * FROM tickets WHERE id = ?', [id]);
      return fresh[0];
    });
    ctx.body = { ticket: toTicket(ticket) };
  },

  async updateStakeholders(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'ticket_not_found');
    const body = ctx.request.body || {};
    if (!Array.isArray(body.stakeholders)) ctx.throw(400, 'stakeholders_required');
    const cleaned = [];
    const seen = new Set();
    for (const item of body.stakeholders) {
      const userId = Number(item && item.user_id);
      if (!Number.isInteger(userId) || userId <= 0 || seen.has(userId)) continue;
      seen.add(userId);
      cleaned.push({
        user_id: userId,
        user_name: item.user_name ? String(item.user_name) : null,
        role: item.role ? String(item.role) : null,
      });
    }
    const [existingRows] = await ctx.app.db.query(
      'SELECT user_id FROM ticket_stakeholders WHERE ticket_id = ?', [id]
    );
    const existing = new Set(existingRows.map((row) => Number(row.user_id)));
    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query('DELETE FROM ticket_stakeholders WHERE ticket_id = ?', [id]);
      if (cleaned.length) {
        await connection.query(
          `INSERT INTO ticket_stakeholders (ticket_id, user_id, user_name, role)
           VALUES ${cleaned.map(() => '(?,?,?,?)').join(',')}`,
          cleaned.flatMap((item) => [id, item.user_id, item.user_name, item.role])
        );
      }
    });
    const added = cleaned.filter((item) => !existing.has(item.user_id));
    await notifyAddedStakeholders(ctx, {
      ticket: rows[0],
      added,
      actorName: ctx.state.user.name || null,
    });
    const [stakeholders] = await ctx.app.db.query(
      'SELECT * FROM ticket_stakeholders WHERE ticket_id = ? ORDER BY id', [id]
    );
    ctx.body = { stakeholders: stakeholders.map(toStakeholder) };
  },

  async remove(ctx) {
    const id = Number(ctx.params.id);
    const [rows] = await ctx.app.db.query('SELECT * FROM tickets WHERE id = ?', [id]);
    if (!rows.length) ctx.throw(404, 'ticket_not_found');
    await withTransaction(ctx.app.db, async (connection) => {
      await connection.query('DELETE FROM ticket_stakeholders WHERE ticket_id = ?', [id]);
      await connection.query('DELETE FROM tickets WHERE id = ?', [id]);
    });
    ctx.body = { id, deleted: true };
  },
};
