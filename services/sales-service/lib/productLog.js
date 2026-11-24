'use strict';

// 写入一条商品变更操作日志
// db 可以是连接池或事务连接（均支持 .query）
async function logProductChange(db, {
  productId, action, operatorId, operatorName,
  before = null, after = null, approvalId = null, note = null,
}) {
  await db.query(
    `INSERT INTO product_change_logs
       (product_id, action, operator_id, operator_name, before_data, after_data, approval_id, note)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      productId, action,
      operatorId, operatorName,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      approvalId, note,
    ]
  );
}

module.exports = { logProductChange };
