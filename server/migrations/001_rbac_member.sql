-- RBAC, approvals and member registration
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) DEFAULT NULL,
  email VARCHAR(160) DEFAULT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('super_admin','sales_manager','salesperson','member') NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  manager_id INT DEFAULT NULL,
  phone VARCHAR(40) DEFAULT NULL,
  project_address VARCHAR(255) DEFAULT NULL,
  electricity_price DECIMAL(12,4) DEFAULT NULL,
  electricity_price_currency ENUM('USD','KHR') NOT NULL DEFAULT 'USD',
  email_verified_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status),
  KEY idx_users_manager (manager_id),
  CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS approval_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_type ENUM('product_create','product_update','product_delete','account_create','account_update','account_delete') NOT NULL,
  requester_id INT NOT NULL,
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

CREATE TABLE IF NOT EXISTS email_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(160) NOT NULL,
  purpose ENUM('register') NOT NULL DEFAULT 'register',
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME DEFAULT NULL,
  attempts TINYINT NOT NULL DEFAULT 0,
  ip VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email_codes_lookup (email, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_config (config_key, config_value) VALUES
  ('installation_fee_percent', '20'),
  ('installation_fee_min_usd', '500');

DELETE FROM system_config WHERE config_key = 'admin_password';
