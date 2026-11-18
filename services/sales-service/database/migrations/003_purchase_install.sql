-- 采购+安装业务流程扩展
-- 1. 用电场景（一个客户可有多个）
CREATE TABLE IF NOT EXISTS scenarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scenario_no VARCHAR(40) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  grid_type ENUM('on_grid','off_grid','hybrid') NOT NULL,
  install_type ENUM('rooftop','ground') NOT NULL,
  scene_type ENUM('residential','cafe','restaurant','supermarket','hotel') NOT NULL,
  monthly_kwh DECIMAL(12,2) NULL,
  area_sqm DECIMAL(10,2) NULL,
  peak_load_kw DECIMAL(10,2) NULL,
  day_kwh DECIMAL(12,2) NULL,
  night_kwh DECIMAL(12,2) NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_scenarios_no (scenario_no),
  KEY idx_scenarios_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 系统配置（预算参考，非审批报价）
CREATE TABLE IF NOT EXISTS system_configs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  config_no VARCHAR(40) NOT NULL,
  scenario_id BIGINT UNSIGNED NOT NULL,
  method ENUM('manual','package','formula') NOT NULL,
  package_id BIGINT UNSIGNED NULL,
  capacity_kw DECIMAL(10,2) NULL,
  inverter_kw DECIMAL(10,2) NULL,
  battery_kwh DECIMAL(10,2) NULL,
  items JSON NOT NULL,
  reference_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_configs_no (config_no),
  KEY idx_configs_scenario (scenario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 套餐组成（PDM 中 products.is_package=1 的产品有子项）
CREATE TABLE IF NOT EXISTS package_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  package_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_package (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 订单项目（替代单字段 amount）
CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  system_config_id BIGINT UNSIGNED NULL,
  item_type ENUM('product','survey_service','construction') NOT NULL DEFAULT 'product',
  product_id BIGINT UNSIGNED NULL,
  name VARCHAR(190) NOT NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. 现有表扩展
ALTER TABLE products ADD COLUMN is_package TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE surveys ADD COLUMN construction_cost DECIMAL(14,2) NULL;
ALTER TABLE surveys ADD COLUMN order_id BIGINT UNSIGNED NULL;
ALTER TABLE quotes ADD COLUMN system_total DECIMAL(14,2) NULL;
ALTER TABLE quotes ADD COLUMN suggested_price DECIMAL(14,2) NULL;
ALTER TABLE quotes ADD COLUMN diff_reason TEXT NULL;
