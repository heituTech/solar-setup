-- 为订单表增加销售人员姓名冗余列（与 customer_name / customers.owner_name 同模式）
-- 便于订单列表直接展示归属人，避免跨服务查 users 表

ALTER TABLE orders
  ADD COLUMN salesperson_name VARCHAR(160) NULL AFTER salesperson_id;
