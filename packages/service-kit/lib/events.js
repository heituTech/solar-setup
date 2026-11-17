'use strict';

const crypto = require('crypto');
const { withTransaction, parseJson } = require('./database');
const { internalFetch } = require('./http');

async function enqueueEvent(connection, event) {
  const eventId = event.eventId || crypto.randomUUID();
  for (const destination of event.destinations) {
    await connection.query(
      `INSERT INTO event_outbox
       (event_id, event_type, aggregate_id, customer_id, destination, payload, actor_id, request_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [eventId, event.type, String(event.aggregateId), event.customerId || null,
        destination, JSON.stringify(event.payload || {}), event.actorId || null, event.requestId || null]
    );
  }
  return eventId;
}

async function consumeInbox(pool, event, handler) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    try {
      await connection.query(
        'INSERT INTO event_inbox (event_id, event_type, payload) VALUES (?,?,?)',
        [event.event_id, event.event_type, JSON.stringify(event.payload || {})]
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        await connection.rollback();
        return { duplicate: true };
      }
      throw error;
    }
    const result = await handler(connection);
    await connection.commit();
    return { duplicate: false, result };
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
}

async function publishOutbox(app) {
  if (!app.db) return;
  const [rows] = await app.db.query(
    `SELECT * FROM event_outbox
     WHERE (status = 'pending' OR (status = 'failed' AND attempts < ?) OR (status = 'publishing' AND updated_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE)))
       AND next_retry_at <= NOW()
     ORDER BY id LIMIT 25`,
    [Number(app.config.outbox.maxAttempts || 12)]
  );
  for (const row of rows) {
    const [claimed] = await app.db.query(
      "UPDATE event_outbox SET status = 'publishing', attempts = attempts + 1 WHERE id = ? AND status <> 'published'",
      [row.id]
    );
    if (!claimed.affectedRows) continue;
    const baseUrl = app.config.internal.services[row.destination];
    if (!baseUrl) {
      await app.db.query("UPDATE event_outbox SET status = 'failed', last_error = ? WHERE id = ?", [`unknown destination ${row.destination}`, row.id]);
      continue;
    }
    try {
      await internalFetch(`${baseUrl}/internal/events`, {
        service: app.config.serviceName,
        body: {
          event_id: row.event_id,
          event_type: row.event_type,
          aggregate_id: row.aggregate_id,
          customer_id: row.customer_id,
          payload: parseJson(row.payload, {}),
          actor_id: row.actor_id,
          request_id: row.request_id,
          created_at: row.created_at,
        },
        requestId: row.request_id,
      });
      await app.db.query("UPDATE event_outbox SET status = 'published', published_at = NOW(), last_error = NULL WHERE id = ?", [row.id]);
    } catch (error) {
      const exhausted = Number(row.attempts) + 1 >= Number(app.config.outbox.maxAttempts || 12);
      const delay = Math.min(300, 2 ** Math.min(Number(row.attempts) + 1, 8));
      await app.db.query(
        `UPDATE event_outbox SET status = ?, next_retry_at = DATE_ADD(NOW(), INTERVAL ? SECOND), last_error = ? WHERE id = ?`,
        [exhausted ? 'failed' : 'pending', delay, String(error.message).slice(0, 1000), row.id]
      );
    }
  }
}

async function retryFailedEvents(db, destination) {
  const params = [];
  let where = "status = 'failed'";
  if (destination) { where += ' AND destination = ?'; params.push(destination); }
  const [result] = await db.query(
    `UPDATE event_outbox SET status = 'pending', attempts = 0, next_retry_at = NOW(), last_error = NULL WHERE ${where}`,
    params
  );
  return result.affectedRows;
}

module.exports = { enqueueEvent, consumeInbox, publishOutbox, retryFailedEvents };
