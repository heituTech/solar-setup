-- 客户创建人记录与所属销售人员变更审计

ALTER TABLE customers
  ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER note,
  ADD COLUMN created_by_name VARCHAR(120) NULL AFTER created_by;

CREATE TABLE IF NOT EXISTS customer_owner_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  old_owner_id BIGINT UNSIGNED NULL,
  old_owner_name VARCHAR(120) NULL,
  new_owner_id BIGINT UNSIGNED NULL,
  new_owner_name VARCHAR(120) NULL,
  changed_by BIGINT UNSIGNED NULL,
  changed_by_name VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customer_owner_logs_customer (customer_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
