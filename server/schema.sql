-- Solar Setup Database Schema
-- MySQL 8.0+

CREATE TABLE IF NOT EXISTS inverters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT '',
  rated_power INT NOT NULL COMMENT 'W',
  type ENUM('off-grid', 'hybrid') NOT NULL,
  battery_voltage ENUM('12V','24V','48V') NOT NULL DEFAULT '48V',
  mppt_channels INT NOT NULL DEFAULT 1,
  mppt_max_current_a DECIMAL(6,1) DEFAULT NULL COMMENT 'Max input current per MPPT channel (A)',
  mppt_max_voltage_v INT DEFAULT NULL COMMENT 'Max input voltage per MPPT channel (V)',
  grid_parallel_max INT NOT NULL DEFAULT 1 COMMENT 'Hybrid mode: max units in parallel on grid side (1 = not supported)',
  offgrid_parallel_max INT NOT NULL DEFAULT 1 COMMENT 'Off-grid mode: max units in parallel (1 = not supported)',
  grid_output_max_w INT DEFAULT NULL COMMENT 'Hybrid grid-tied max output power (W); NULL = unlimited pass-through',
  battery_less_start TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = hybrid inverter can start and run without a battery',
  warranty_months INT NOT NULL DEFAULT 24,
  price_usd DECIMAL(12,2) NOT NULL,
  price_khr DECIMAL(14,2) NOT NULL DEFAULT 0,
  sales_status ENUM('on_sale','discontinued') NOT NULL DEFAULT 'on_sale',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS solar_panels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT '',
  rated_power INT NOT NULL COMMENT 'W',
  length_mm DECIMAL(8,2) DEFAULT NULL,
  width_mm DECIMAL(8,2) DEFAULT NULL,
  height_mm DECIMAL(8,2) DEFAULT NULL,
  voltage_min DECIMAL(8,1) DEFAULT NULL,
  voltage_max DECIMAL(8,1) DEFAULT NULL,
  voc_v DECIMAL(8,1) DEFAULT NULL COMMENT 'Open-circuit voltage (V)',
  isc_a DECIMAL(8,1) DEFAULT NULL COMMENT 'Short-circuit current (A)',
  glass_type ENUM('single','double') NOT NULL DEFAULT 'single',
  technology JSON DEFAULT NULL COMMENT '["N type","P type","Topcon","HTJ","BC"]',
  warranty_months INT NOT NULL DEFAULT 240,
  price_usd DECIMAL(12,2) NOT NULL,
  price_khr DECIMAL(14,2) NOT NULL DEFAULT 0,
  sales_status ENUM('on_sale','discontinued') NOT NULL DEFAULT 'on_sale',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS batteries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL DEFAULT '',
  capacity_kwh DECIMAL(10,3) NOT NULL COMMENT 'kWh',
  nominal_voltage DECIMAL(6,1) NOT NULL DEFAULT 48 COMMENT 'V',
  type ENUM('lead-acid','lithium-ternary','lfp') NOT NULL,
  discharge_rate DECIMAL(6,2) NOT NULL DEFAULT 0.5 COMMENT 'C-rate',
  parallel_supported TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = parallel connection allowed, 0 = single unit only',
  bms_brand VARCHAR(100) DEFAULT NULL COMMENT 'Battery management system vendor',
  warranty_months INT NOT NULL DEFAULT 36,
  price_usd DECIMAL(12,2) NOT NULL,
  price_khr DECIMAL(14,2) NOT NULL DEFAULT 0,
  sales_status ENUM('on_sale','discontinued') NOT NULL DEFAULT 'on_sale',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_config (
  config_key VARCHAR(64) PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default configuration
INSERT INTO system_config (config_key, config_value) VALUES
  ('default_peak_sun_hours', '5'),
  ('default_currency', 'USD'),
  ('usd_to_khr', '4100'),
  ('installation_fee_percent', '20'),
  ('installation_fee_min_usd', '500'),
  ('battery_price_lfp_per_kwh', '120'),
  ('battery_price_ternary_per_kwh', '120'),
  ('battery_price_lead_acid_per_kwh', '85')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) DEFAULT NULL,
  email VARCHAR(160) DEFAULT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('super_admin','sales_manager','salesperson','member') NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  phone VARCHAR(40) DEFAULT NULL,
  project_address VARCHAR(255) DEFAULT NULL,
  electricity_price DECIMAL(12,4) DEFAULT NULL,
  electricity_price_currency ENUM('USD','KHR') NOT NULL DEFAULT 'USD',
  email_verified_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sales_manager_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  manager_id INT NOT NULL,
  salesperson_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sml_salesperson (salesperson_id),
  KEY idx_sml_manager (manager_id),
  CONSTRAINT fk_sml_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sml_salesperson FOREIGN KEY (salesperson_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS approval_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_type ENUM('product_create','product_update','product_delete','account_create','account_update','account_delete','account_register') NOT NULL,
  requester_id INT DEFAULT NULL,
  approver_role ENUM('super_admin','sales_manager') NOT NULL,
  approver_id INT DEFAULT NULL,
  status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  target_table ENUM('inverters','solar_panels','batteries','users') NOT NULL,
  target_id INT DEFAULT NULL,
  payload JSON NOT NULL,
  reason TEXT DEFAULT NULL,
  review_note TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME DEFAULT NULL,
  KEY idx_approvals_review (status, approver_role, created_at),
  KEY idx_approvals_requester (requester_id),
  CONSTRAINT fk_approvals_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_approvals_approver FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS approval_flows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  request_type ENUM('product_create','product_update','product_delete','account_create','account_update','account_delete','account_register') NOT NULL,
  requester_role ENUM('salesperson','sales_manager') NOT NULL,
  approver_role ENUM('super_admin','sales_manager') NOT NULL,
  require_approval TINYINT(1) NOT NULL DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_flows_type_role (request_type, requester_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO approval_flows (name, request_type, requester_role, approver_role, require_approval, enabled) VALUES
  ('Salesperson product create', 'product_create', 'salesperson', 'sales_manager', 1, 1),
  ('Salesperson product update', 'product_update', 'salesperson', 'sales_manager', 1, 1),
  ('Salesperson product delete', 'product_delete', 'salesperson', 'sales_manager', 1, 1),
  ('Manager account create', 'account_create', 'sales_manager', 'super_admin', 1, 1),
  ('Manager account update', 'account_update', 'sales_manager', 'super_admin', 1, 1),
  ('Manager account delete', 'account_delete', 'sales_manager', 'super_admin', 1, 1),
  ('Salesperson registration', 'account_register', 'salesperson', 'sales_manager', 1, 1),
  ('Sales manager registration', 'account_register', 'sales_manager', 'super_admin', 1, 1)
ON DUPLICATE KEY UPDATE request_type = VALUES(request_type);

CREATE TABLE IF NOT EXISTS email_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(160) NOT NULL,
  purpose ENUM('register','login','profile','password') NOT NULL DEFAULT 'register',
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME DEFAULT NULL,
  attempts TINYINT NOT NULL DEFAULT 0,
  ip VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email_codes_lookup (email, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
