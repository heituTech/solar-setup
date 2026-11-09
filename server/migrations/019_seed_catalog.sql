-- Rebuild the product catalog with the initial launch products.
-- NOTE: this is a one-time seed migration. Running it again resets the catalog.

DELETE FROM inverters;
DELETE FROM solar_panels;
DELETE FROM batteries;

INSERT INTO solar_panels
  (brand, model, rated_power, length_mm, width_mm, height_mm, glass_type, technology, warranty_months, price_usd, price_khr, sales_status)
VALUES
  ('Shinefine', '', 600, 2278, 1134, 30, 'double', JSON_ARRAY('N type', 'Topcon'), 240, 84, 0, 'on_sale');

INSERT INTO inverters
  (brand, model, rated_power, type, battery_voltage, mppt_channels, mppt_max_current_a, mppt_max_voltage_v, grid_parallel_max, offgrid_parallel_max, grid_output_max_w, battery_less_start, warranty_months, price_usd, price_khr, sales_status)
VALUES
  ('Techfine', '6248MHQ', 6200, 'hybrid', '48V', 1, 25, 500, 6, 1, NULL, 1, 24, 245, 0, 'on_sale'),
  ('Techfine', '3624MHQ', 3600, 'hybrid', '24V', 1, 20, 500, 6, 1, NULL, 1, 24, 350, 0, 'on_sale'),
  ('Fecility', 'iVAM6000P1G1', 6000, 'hybrid', '48V', 2, 20, 500, 6, 1, NULL, 1, 24, 475, 0, 'on_sale'),
  ('Fecility', 'iVEM12048', 10000, 'off-grid', '48V', 2, 20, 500, 1, 1, NULL, 0, 24, 650, 0, 'on_sale');

INSERT INTO batteries
  (brand, model, capacity_kwh, nominal_voltage, type, discharge_rate, parallel_supported, bms_brand, warranty_months, price_usd, price_khr, sales_status)
VALUES
  ('Fecility', 'FLA48350TG2', 17.5, 48, 'lfp', 0.5, 1, '派能', 36, 1875, 0, 'on_sale');
