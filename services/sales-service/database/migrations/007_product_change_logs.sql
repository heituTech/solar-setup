-- 商品变更操作日志：记录商品的增删改（含审批通过后落地的变更）
CREATE TABLE IF NOT EXISTS product_change_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NULL,
  action VARCHAR(20) NOT NULL,
  operator_id BIGINT UNSIGNED NULL,
  operator_name VARCHAR(120) NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  approval_id BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pcl_product (product_id),
  KEY idx_pcl_action (action),
  KEY idx_pcl_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
