CREATE TABLE IF NOT EXISTS hrms_report_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(120) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hrms_recipient_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hrms_report_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period CHAR(7) NOT NULL,
  report_type VARCHAR(20) NOT NULL,
  recipient VARCHAR(190) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hrms_logs_period (period, report_type),
  KEY idx_hrms_logs_recipient (recipient)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
