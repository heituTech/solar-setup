CREATE TABLE IF NOT EXISTS commission_rule_versions (
  effective_period CHAR(7) NOT NULL,
  retail_rate DECIMAL(6,4) NOT NULL DEFAULT 0.0800,
  band_retail_max DECIMAL(14,2) NOT NULL DEFAULT 1500.00,
  engineering_rate_low DECIMAL(6,4) NOT NULL DEFAULT 0.0400,
  band_engineering_low_max DECIMAL(14,2) NOT NULL DEFAULT 5000.00,
  engineering_rate_mid DECIMAL(6,4) NOT NULL DEFAULT 0.0500,
  band_engineering_mid_max DECIMAL(14,2) NOT NULL DEFAULT 15000.00,
  engineering_rate_high DECIMAL(6,4) NOT NULL DEFAULT 0.0600,
  first_stage_ratio DECIMAL(6,4) NOT NULL DEFAULT 0.3000,
  first_stage_threshold DECIMAL(6,4) NOT NULL DEFAULT 0.5000,
  final_stage_ratio DECIMAL(6,4) NOT NULL DEFAULT 0.7000,
  referral_rate DECIMAL(6,4) NOT NULL DEFAULT 0.0100,
  referral_exclusive TINYINT(1) NOT NULL DEFAULT 1,
  first_order_reward DECIMAL(14,2) NOT NULL DEFAULT 20.00,
  survey_threshold INT NOT NULL DEFAULT 15,
  survey_reward DECIMAL(14,2) NOT NULL DEFAULT 50.00,
  base_salary DECIMAL(14,2) NOT NULL DEFAULT 300.00,
  champion_reward DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  champion_basis VARCHAR(20) NOT NULL DEFAULT 'received',
  note VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (effective_period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO commission_rule_versions (effective_period, note)
VALUES (DATE_FORMAT(CURDATE(), '%Y-%m'), 'default rule seed');
