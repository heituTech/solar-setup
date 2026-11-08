CREATE TABLE IF NOT EXISTS cases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  name VARCHAR(100) DEFAULT NULL,
  address VARCHAR(255) NOT NULL,
  has_grid TINYINT(1) NOT NULL DEFAULT 1,
  install_type ENUM('ground','rooftop') NOT NULL DEFAULT 'rooftop',
  system_mode ENUM('off-grid','hybrid') NOT NULL DEFAULT 'hybrid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cases_member FOREIGN KEY (member_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE system_config SET config_value = '4.5' WHERE config_key = 'default_peak_sun_hours';

INSERT INTO system_config (config_key, config_value) VALUES ('installation_fee_ground_percent', '15') ON DUPLICATE KEY UPDATE config_value = config_value;

INSERT INTO system_config (config_key, config_value) VALUES ('installation_fee_rooftop_percent', '20') ON DUPLICATE KEY UPDATE config_value = config_value;
