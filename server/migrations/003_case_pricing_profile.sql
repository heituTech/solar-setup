ALTER TABLE cases
  ADD COLUMN electricity_price DECIMAL(12,4) DEFAULT NULL AFTER system_mode,
  ADD COLUMN electricity_price_currency ENUM('USD','KHR') NOT NULL DEFAULT 'USD' AFTER electricity_price;

ALTER TABLE users
  ADD COLUMN full_name VARCHAR(100) DEFAULT NULL AFTER username;
