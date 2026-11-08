-- Voltage / current fields: one decimal place
ALTER TABLE inverters MODIFY COLUMN mppt_max_current_a DECIMAL(6,1) DEFAULT NULL COMMENT 'Max input current per MPPT channel (A)';
ALTER TABLE solar_panels MODIFY COLUMN voltage_min DECIMAL(8,1) DEFAULT NULL;
ALTER TABLE solar_panels MODIFY COLUMN voltage_max DECIMAL(8,1) DEFAULT NULL;
ALTER TABLE batteries MODIFY COLUMN nominal_voltage DECIMAL(6,1) NOT NULL DEFAULT 48 COMMENT 'V';
