'use strict';

/**
 * 审计日志：所有变更操作（出库、收款、验收等）统一写入 audit_logs，
 * 记录操作人、时间、变更前后值。调用方传入当前事务连接，保证与业务同事务。
 */

async function record(conn, entry) {
  const {
    module, entity, entityId, action,
    actor = {}, before = null, after = null, remark = null,
  } = entry;
  await conn.query(
    `INSERT INTO audit_logs
     (module, entity, entity_id, action, actor_id, actor_name, before_json, after_json, remark)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      module, entity, entityId === undefined || entityId === null ? null : String(entityId), action,
      actor.id || null, actor.name || null,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      remark,
    ]
  );
}

module.exports = { record };
