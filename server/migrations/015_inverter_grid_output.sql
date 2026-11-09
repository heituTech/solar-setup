ALTER TABLE inverters
  ADD COLUMN grid_output_max_w INT DEFAULT NULL COMMENT 'Hybrid grid-tied max output power (W); NULL = unlimited pass-through' AFTER offgrid_parallel_max;
