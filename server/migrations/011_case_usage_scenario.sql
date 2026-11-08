ALTER TABLE cases
  ADD COLUMN usage_scenario ENUM('house','supermarket','resort','cafe') DEFAULT NULL AFTER name,
  ADD COLUMN load_items JSON DEFAULT NULL AFTER usage_scenario;
