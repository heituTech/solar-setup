-- 售后工单：订单号、创建人姓名与干系人

ALTER TABLE tickets
  ADD COLUMN order_no VARCHAR(40) NULL AFTER order_id,
  ADD COLUMN created_by_name VARCHAR(120) NULL AFTER created_by;

CREATE TABLE IF NOT EXISTS ticket_stakeholders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  user_name VARCHAR(120) NULL,
  role VARCHAR(40) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ticket_stakeholders (ticket_id, user_id),
  KEY idx_ticket_stakeholders_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
