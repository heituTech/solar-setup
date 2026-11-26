-- 光伏工程一体化 ERP 初始 schema
-- 约定：所有业务表使用 utf8mb4；金额 DECIMAL(14,2)；时间使用 DATETIME/TIMESTAMP

-- ---------------------------------------------------------------------------
-- auth 域：账号 / 角色 / 门店数据范围
-- 角色：admin（管理员）、store_manager（店长）、store_clerk（门店店员）、
--       electrical_engineer（电气工程师）、structural_engineer（结构工程师）、
--       construction_captain（施工队长）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(60) NOT NULL,
  password_hash VARCHAR(120) NOT NULL,
  name VARCHAR(80) NOT NULL,
  role VARCHAR(40) NOT NULL,
  store_id BIGINT UNSIGNED NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(120) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  KEY idx_users_role (role),
  KEY idx_users_store (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- master 域：门店 / 产品 / 供应商 / 工程师 / 班组
-- 统一编码：ST0001 / PRD0001 / SUP0001 / ENG0001 / CRW0001
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  region VARCHAR(120) NULL,
  address VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  manager_name VARCHAR(80) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_stores_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'other',
  brand VARCHAR(80) NULL,
  model VARCHAR(120) NULL,
  spec VARCHAR(255) NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
  sale_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  supplier_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_products_code (code),
  KEY idx_products_category (category),
  KEY idx_products_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  contact VARCHAR(80) NULL,
  phone VARCHAR(40) NULL,
  address VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_suppliers_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS engineers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'electrical',
  phone VARCHAR(40) NULL,
  user_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_engineers_code (code),
  KEY idx_engineers_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  leader_name VARCHAR(80) NULL,
  captain_user_id BIGINT UNSIGNED NULL,
  phone VARCHAR(40) NULL,
  store_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_crews_code (code),
  KEY idx_crews_store (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- sales 域：门店销售单 + POS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(40) NOT NULL,
  store_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(40) NULL,
  customer_address VARCHAR(255) NULL,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  deposit_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  remark VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_by_name VARCHAR(80) NULL,
  confirmed_by BIGINT UNSIGNED NULL,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sales_orders_no (order_no),
  KEY idx_sales_orders_store (store_id),
  KEY idx_sales_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sales_order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_code VARCHAR(40) NULL,
  product_name VARCHAR(160) NOT NULL,
  unit VARCHAR(20) NULL,
  qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_sales_items_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- project 域：客户 / 项目工单 / 勘测 / 报价 / 合同 / 收款计划 / 施工 / 验收 / 质保
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  store_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(120) NULL,
  address VARCHAR(255) NULL,
  source VARCHAR(40) NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  remark VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customers_code (code),
  KEY idx_customers_store (store_id),
  KEY idx_customers_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_no VARCHAR(40) NOT NULL,
  sales_order_id BIGINT UNSIGNED NULL,
  store_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(40) NULL,
  customer_address VARCHAR(255) NULL,
  capacity_kw DECIMAL(12,3) NOT NULL DEFAULT 0,
  system_type VARCHAR(30) NOT NULL DEFAULT 'roof',
  status VARCHAR(30) NOT NULL DEFAULT 'created',
  sales_user_id BIGINT UNSIGNED NULL,
  sales_user_name VARCHAR(80) NULL,
  surveyor_id BIGINT UNSIGNED NULL,
  surveyor_name VARCHAR(80) NULL,
  crew_id BIGINT UNSIGNED NULL,
  captain_user_id BIGINT UNSIGNED NULL,
  captain_name VARCHAR(80) NULL,
  contract_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  remark VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_projects_no (project_no),
  KEY idx_projects_store (store_id),
  KEY idx_projects_status (status),
  KEY idx_projects_surveyor (surveyor_id),
  KEY idx_projects_captain (captain_user_id),
  KEY idx_projects_order (sales_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS surveys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  survey_no VARCHAR(40) NOT NULL,
  engineer_id BIGINT UNSIGNED NULL,
  engineer_name VARCHAR(80) NULL,
  survey_date DATE NULL,
  roof_type VARCHAR(40) NULL,
  roof_area DECIMAL(12,2) NULL,
  roof_condition VARCHAR(255) NULL,
  grid_phase VARCHAR(20) NULL,
  meter_no VARCHAR(80) NULL,
  remarks VARCHAR(1000) NULL,
  photo_ids JSON NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  submitted_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_surveys_project (project_id),
  UNIQUE KEY uk_surveys_no (survey_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quotes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  quote_no VARCHAR(40) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  items JSON NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  final_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  remark VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_quotes_no (quote_no),
  KEY idx_quotes_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contracts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  contract_no VARCHAR(40) NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  deposit_ratio DECIMAL(5,2) NOT NULL DEFAULT 30,
  signed_at DATE NULL,
  file_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_contracts_no (contract_no),
  UNIQUE KEY uk_contracts_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payment_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  contract_id BIGINT UNSIGNED NOT NULL,
  seq INT NOT NULL DEFAULT 1,
  name VARCHAR(80) NOT NULL,
  ratio DECIMAL(5,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  due_date DATE NULL,
  received_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_plans_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS constructions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  captain_user_id BIGINT UNSIGNED NULL,
  captain_name VARCHAR(80) NULL,
  crew_id BIGINT UNSIGNED NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  progress INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  remark VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_constructions_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS construction_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  log_date DATE NOT NULL,
  content VARCHAR(1000) NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  photo_ids JSON NULL,
  created_by BIGINT UNSIGNED NULL,
  created_by_name VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_construction_logs_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acceptances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  acceptance_no VARCHAR(40) NOT NULL,
  result VARCHAR(20) NOT NULL DEFAULT 'passed',
  accepted_at DATE NULL,
  grid_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  grid_connection_no VARCHAR(80) NULL,
  doc_ids JSON NULL,
  remark VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_acceptances_no (acceptance_no),
  UNIQUE KEY uk_acceptances_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS warranties (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  warranty_no VARCHAR(40) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  scope VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_warranties_no (warranty_no),
  UNIQUE KEY uk_warranties_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- inventory 域：门店库存 / 领料 / 余料退回 / 成本归集
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stocks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  safety_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  cost_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_stocks_store_product (store_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(20) NOT NULL,
  qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  before_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  after_qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ref_type VARCHAR(30) NULL,
  ref_id BIGINT UNSIGNED NULL,
  operator_id BIGINT UNSIGNED NULL,
  operator_name VARCHAR(80) NULL,
  remark VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_movements_store_product (store_id, product_id),
  KEY idx_movements_ref (ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS material_issues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  issue_no VARCHAR(40) NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  store_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  total_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  requested_by BIGINT UNSIGNED NULL,
  requested_by_name VARCHAR(80) NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  issued_at DATETIME NULL,
  remark VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_material_issues_no (issue_no),
  KEY idx_material_issues_project (project_id),
  KEY idx_material_issues_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS material_issue_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  issue_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_code VARCHAR(40) NULL,
  product_name VARCHAR(160) NOT NULL,
  unit VARCHAR(20) NULL,
  qty DECIMAL(14,3) NOT NULL DEFAULT 0,
  cost_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_issue_items_issue (issue_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS material_returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_no VARCHAR(40) NOT NULL,
  issue_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  store_id BIGINT UNSIGNED NOT NULL,
  items JSON NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  operator_id BIGINT UNSIGNED NULL,
  operator_name VARCHAR(80) NULL,
  remark VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_material_returns_no (return_no),
  KEY idx_material_returns_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- finance 域：应收 / 收款核销 / 项目成本
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receivables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NULL,
  store_id BIGINT UNSIGNED NULL,
  source_type VARCHAR(30) NOT NULL DEFAULT 'payment_plan',
  source_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  received_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  due_date DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_receivables_project (project_id),
  KEY idx_receivables_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_no VARCHAR(40) NOT NULL,
  project_id BIGINT UNSIGNED NULL,
  sales_order_id BIGINT UNSIGNED NULL,
  receivable_id BIGINT UNSIGNED NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  method VARCHAR(30) NOT NULL DEFAULT 'bank',
  received_at DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  remark VARCHAR(255) NULL,
  operator_id BIGINT UNSIGNED NULL,
  operator_name VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_receipts_no (receipt_no),
  KEY idx_receipts_project (project_id),
  KEY idx_receipts_order (sales_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_costs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'material',
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ref_type VARCHAR(30) NULL,
  ref_id BIGINT UNSIGNED NULL,
  remark VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_project_costs_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- notification 域：站内消息（可选外发企业微信/飞书）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  role VARCHAR(40) NULL,
  title VARCHAR(160) NOT NULL,
  content VARCHAR(1000) NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'system',
  biz_type VARCHAR(30) NULL,
  biz_id BIGINT UNSIGNED NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'internal',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, is_read),
  KEY idx_notifications_role (role, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- common 域：文件服务 / 审计日志 / 统一编号
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  file_no VARCHAR(40) NOT NULL,
  biz_type VARCHAR(40) NULL,
  biz_id BIGINT UNSIGNED NULL,
  filename VARCHAR(255) NOT NULL,
  mime VARCHAR(120) NULL,
  size INT UNSIGNED NOT NULL DEFAULT 0,
  path VARCHAR(500) NOT NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  uploaded_by_name VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_files_no (file_no),
  KEY idx_files_biz (biz_type, biz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module VARCHAR(40) NOT NULL,
  entity VARCHAR(60) NOT NULL,
  entity_id VARCHAR(60) NULL,
  action VARCHAR(40) NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  actor_name VARCHAR(80) NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  remark VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_entity (entity, entity_id),
  KEY idx_audit_module (module, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sys_sequences (
  name VARCHAR(40) NOT NULL,
  period VARCHAR(20) NOT NULL,
  seq_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (name, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
