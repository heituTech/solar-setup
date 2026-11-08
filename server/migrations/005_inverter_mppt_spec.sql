-- Per-MPPT electrical limits (optional, NULL = not specified)
ALTER TABLE inverters
  ADD COLUMN mppt_max_current_a DECIMAL(6,2) DEFAULT NULL COMMENT 'Max input current per MPPT channel (A)',
  ADD COLUMN mppt_max_voltage_v DECIMAL(7,1) DEFAULT NULL COMMENT 'Max input voltage per MPPT channel (V)';
