-- 报价关联客户用电场景（历史报价允许为空，修改时必须补选）
ALTER TABLE quotes
  ADD COLUMN scenario_id BIGINT UNSIGNED NULL AFTER customer_id,
  ADD KEY idx_quotes_scenario (scenario_id);

-- 现场勘测改为关联报价，并补充踏勘时间、指定工程师、完工审核信息
-- 状态流转：draft -> submitted(待审核) -> reviewed(审核通过/施工中)
--          -> completion_pending(申请完成待审核) -> completed
--          invalid(审核不通过可重提)；completed 可申请重新踏勘回到 submitted
ALTER TABLE surveys
  ADD COLUMN quote_id BIGINT UNSIGNED NULL AFTER customer_id,
  ADD COLUMN engineer_id BIGINT UNSIGNED NULL AFTER quote_id,
  ADD COLUMN engineer_name VARCHAR(120) NULL AFTER engineer_id,
  ADD COLUMN departure_at DATETIME NULL AFTER engineer_name,
  ADD COLUMN finish_at DATETIME NULL AFTER departure_at,
  ADD COLUMN completed_at DATETIME NULL AFTER finish_at,
  ADD COLUMN completion_reviewed_by BIGINT UNSIGNED NULL AFTER completed_at,
  ADD COLUMN completion_reviewed_by_name VARCHAR(120) NULL AFTER completion_reviewed_by,
  ADD COLUMN completion_review_note VARCHAR(500) NULL AFTER completion_reviewed_by_name,
  ADD COLUMN completion_reviewed_at DATETIME NULL AFTER completion_review_note,
  ADD KEY idx_surveys_quote (quote_id),
  ADD KEY idx_surveys_engineer (engineer_id);
