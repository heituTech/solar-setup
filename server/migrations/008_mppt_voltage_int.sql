-- MPPT max input voltage becomes integer (V)
ALTER TABLE inverters MODIFY COLUMN mppt_max_voltage_v INT DEFAULT NULL COMMENT 'Max input voltage per MPPT channel (V)';
