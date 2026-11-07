-- Solar Setup Database Schema
-- MySQL 8.0+

CREATE TABLE IF NOT EXISTS inverters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(100) NOT NULL,
  rated_power DECIMAL(10,2) NOT NULL COMMENT 'W',
  type ENUM('off-grid', 'hybrid') NOT NULL,
  battery_voltage ENUM('12V','24V','48V') NOT NULL DEFAULT '48V',
  mppt_channels INT NOT NULL DEFAULT 1,
  warranty_months INT NOT NULL DEFAULT 24,
  price_usd DECIMAL(12,2) NOT NULL,
  price_khr DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS solar_panels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(100) NOT NULL,
  rated_power DECIMAL(10,2) NOT NULL COMMENT 'W',
  length_mm DECIMAL(8,2) DEFAULT NULL,
  width_mm DECIMAL(8,2) DEFAULT NULL,
  height_mm DECIMAL(8,2) DEFAULT NULL,
  voltage_min DECIMAL(8,2) DEFAULT NULL,
  voltage_max DECIMAL(8,2) DEFAULT NULL,
  glass_type ENUM('single','double') NOT NULL DEFAULT 'single',
  technology JSON DEFAULT NULL COMMENT '["N type","P type","Topcon","HTJ","BC"]',
  warranty_months INT NOT NULL DEFAULT 240,
  price_usd DECIMAL(12,2) NOT NULL,
  price_khr DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS batteries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(100) NOT NULL,
  capacity_kwh DECIMAL(10,3) NOT NULL COMMENT 'kWh',
  nominal_voltage DECIMAL(6,2) NOT NULL DEFAULT 48 COMMENT 'V',
  type ENUM('lead-acid','lithium-ternary','lfp') NOT NULL,
  discharge_rate DECIMAL(6,2) NOT NULL DEFAULT 0.5 COMMENT 'C-rate',
  warranty_months INT NOT NULL DEFAULT 36,
  price_usd DECIMAL(12,2) NOT NULL,
  price_khr DECIMAL(14,2) NOT NULL DEFAULT 0,
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
  ('admin_password', 'admin123'),
  ('default_peak_sun_hours', '5'),
  ('default_currency', 'USD'),
  ('usd_to_khr', '4100')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);
