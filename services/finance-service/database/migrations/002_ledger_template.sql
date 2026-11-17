ALTER TABLE order_ledger
  ADD COLUMN deal_date DATE NULL AFTER order_no,
  ADD COLUMN customer_phone VARCHAR(40) NULL AFTER customer_name,
  ADD COLUMN customer_type VARCHAR(20) NULL AFTER customer_phone,
  ADD COLUMN order_type VARCHAR(20) NULL AFTER customer_type,
  ADD COLUMN product_config VARCHAR(1000) NULL AFTER order_type,
  ADD COLUMN discount_approver VARCHAR(120) NULL AFTER order_amount,
  ADD COLUMN deposit_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER discount_approver,
  ADD COLUMN deposit_received TINYINT(1) NOT NULL DEFAULT 0 AFTER deposit_amount,
  ADD COLUMN balance_amount DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER deposit_received,
  ADD COLUMN balance_received TINYINT(1) NOT NULL DEFAULT 0 AFTER balance_amount,
  ADD COLUMN deposit_commission DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER commission_amount,
  ADD COLUMN settlement_commission DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER deposit_commission,
  ADD COLUMN paid_commission DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER settlement_commission,
  ADD COLUMN delivery_date DATE NULL AFTER paid_commission,
  ADD COLUMN referral_flag TINYINT(1) NOT NULL DEFAULT 0 AFTER delivery_date,
  ADD COLUMN referral_name VARCHAR(160) NULL AFTER referral_flag,
  ADD COLUMN note VARCHAR(500) NULL AFTER referral_name;

ALTER TABLE settlements
  ADD COLUMN deposit_commission_total DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER base_salary,
  ADD COLUMN settlement_commission_total DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER deposit_commission_total,
  ADD COLUMN first_order_reward DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER adjustment_total,
  ADD COLUMN referral_reward DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER first_order_reward,
  ADD COLUMN diligence_reward DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER referral_reward,
  ADD COLUMN champion_reward DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER diligence_reward,
  ADD COLUMN deduction_total DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER champion_reward,
  ADD COLUMN survey_count INT NOT NULL DEFAULT 0 AFTER deduction_total;

CREATE TABLE IF NOT EXISTS survey_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  survey_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(160) NULL,
  salesperson_id BIGINT UNSIGNED NULL,
  salesperson_name VARCHAR(120) NULL,
  address VARCHAR(300) NULL,
  photo_refs VARCHAR(500) NULL,
  confirm_method VARCHAR(120) NULL,
  requirement_summary VARCHAR(1000) NULL,
  is_valid TINYINT(1) NOT NULL DEFAULT 0,
  note VARCHAR(500) NULL,
  survey_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_survey_records_survey (survey_id),
  KEY idx_survey_records_salesperson (salesperson_id),
  KEY idx_survey_records_date (survey_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE compensation_config
  MODIFY COLUMN first_order_reward DECIMAL(14,2) NOT NULL DEFAULT 20.00,
  MODIFY COLUMN survey_reward DECIMAL(14,2) NOT NULL DEFAULT 50.00;

UPDATE compensation_config SET first_order_reward = 20 WHERE id = 1 AND first_order_reward = 0;
UPDATE compensation_config SET survey_reward = 50 WHERE id = 1 AND survey_reward = 0;
