ALTER TABLE batteries
  ADD COLUMN parallel_supported TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = parallel connection allowed, 0 = single unit only' AFTER discharge_rate,
  ADD COLUMN bms_brand VARCHAR(100) DEFAULT NULL COMMENT 'Battery management system vendor' AFTER parallel_supported;
