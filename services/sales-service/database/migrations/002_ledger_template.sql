ALTER TABLE customers
  ADD COLUMN customer_type VARCHAR(20) NOT NULL DEFAULT 'retail' AFTER source;

ALTER TABLE surveys
  ADD COLUMN created_by_name VARCHAR(120) NULL AFTER created_by;
