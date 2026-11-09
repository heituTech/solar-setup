-- Configurable approval flows (super admin CRUD).
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
