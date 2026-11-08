-- Inverter parallel capability: max units per product (1 = cannot be paralleled)
ALTER TABLE inverters
  ADD COLUMN grid_parallel_max INT NOT NULL DEFAULT 1 COMMENT 'Hybrid mode: max units in parallel on grid side (1 = not supported)',
  ADD COLUMN offgrid_parallel_max INT NOT NULL DEFAULT 1 COMMENT 'Off-grid mode: max units in parallel (1 = not supported)';

-- Existing models are all parallel-capable
UPDATE inverters SET grid_parallel_max = 6, offgrid_parallel_max = 6;

-- New models:
-- Taqifeng QD6248: hybrid 6.2kW, grid side can parallel, off-grid side cannot
-- Fecility IVAM6048P1G1: hybrid 6kW, neither grid nor off-grid parallel
INSERT INTO inverters (brand, rated_power, type, battery_voltage, mppt_channels, warranty_months, price_usd, price_khr, sales_status, grid_parallel_max, offgrid_parallel_max) VALUES
('泰琪丰 QD6248', 6200, 'hybrid', '48V', 2, 60, 330, 1353000, 'on_sale', 6, 1),
('Fecility IVAM6048P1G1', 6000, 'hybrid', '48V', 2, 60, 495, 2029500, 'on_sale', 1, 1);
