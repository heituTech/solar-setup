-- 025: Case project location (country / province / city cascade) + coordinates
-- for PVGIS-based peak-sun-hour lookup. The free-text `address` column stays as
-- the composed display string for backward compatibility.
ALTER TABLE cases
  ADD COLUMN country_code VARCHAR(2) NULL AFTER address,
  ADD COLUMN state_code VARCHAR(10) NULL AFTER country_code,
  ADD COLUMN city VARCHAR(120) NULL AFTER state_code,
  ADD COLUMN latitude DECIMAL(9,6) NULL AFTER city,
  ADD COLUMN longitude DECIMAL(9,6) NULL AFTER latitude;
