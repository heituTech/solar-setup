-- 订单作废：保留订单记录，仅标记状态与作废信息（不物理删除）
ALTER TABLE orders
  ADD COLUMN voided_at DATETIME NULL AFTER status,
  ADD COLUMN voided_by BIGINT UNSIGNED NULL AFTER voided_at,
  ADD COLUMN voided_by_name VARCHAR(120) NULL AFTER voided_by,
  ADD COLUMN void_reason VARCHAR(500) NULL AFTER voided_by_name;
