-- 勘测单关联客户已有的用电场景
-- 历史勘测单允许为空，新建勘测单必须选择该客户下已存在的场景
ALTER TABLE surveys
  ADD COLUMN scenario_id BIGINT UNSIGNED NULL AFTER customer_id,
  ADD KEY idx_surveys_scenario (scenario_id);
