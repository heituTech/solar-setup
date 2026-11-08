-- Solar panel electrical ratings: open-circuit voltage & short-circuit current
ALTER TABLE solar_panels
  ADD COLUMN voc_v DECIMAL(8,1) DEFAULT NULL COMMENT 'Open-circuit voltage (V)',
  ADD COLUMN isc_a DECIMAL(8,1) DEFAULT NULL COMMENT 'Short-circuit current (A)';
