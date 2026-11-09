ALTER TABLE inverters
  ADD COLUMN battery_less_start TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = hybrid inverter can start and run without a battery' AFTER grid_output_max_w;
