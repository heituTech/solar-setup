-- 采购+安装业务 seed 数据
-- 1. 踏勘服务产品（PDM 维护价格）
INSERT INTO products (category, model, name, specs, price, unit, status)
SELECT 'survey_service', 'SURVEY-001', '现场踏勘服务', JSON_OBJECT('description', '工程师上门踏勘费用'), 150.00, '次', 'active'
WHERE NOT EXISTS (SELECT 1 FROM products WHERE category = 'survey_service' LIMIT 1);

-- 2. 基础产品（光伏板、逆变器、电池、支架）
INSERT INTO products (category, model, name, specs, price, unit, status) SELECT * FROM (
  SELECT 'panel' AS category, 'PANEL-450W' AS model, '单晶硅光伏板 450W' AS name,
    JSON_OBJECT('power', 0.45, 'efficiency', 0.21) AS specs, 85.00 AS price, '块' AS unit, 'active' AS status
  UNION ALL SELECT 'panel', 'PANEL-550W', '单晶硅光伏板 550W', JSON_OBJECT('power', 0.55, 'efficiency', 0.22), 105.00, '块', 'active'
  UNION ALL SELECT 'inverter', 'INV-5K', '并网逆变器 5kW', JSON_OBJECT('power', 5, 'type', 'on_grid'), 680.00, '台', 'active'
  UNION ALL SELECT 'inverter', 'INV-10K', '并网逆变器 10kW', JSON_OBJECT('power', 10, 'type', 'on_grid'), 1250.00, '台', 'active'
  UNION ALL SELECT 'inverter', 'INV-HYB-8K', '混合逆变器 8kW', JSON_OBJECT('power', 8, 'type', 'hybrid'), 1480.00, '台', 'active'
  UNION ALL SELECT 'battery', 'BAT-5KWH', '锂电池 5kWh', JSON_OBJECT('capacity', 5, 'type', 'lithium'), 1800.00, '组', 'active'
  UNION ALL SELECT 'battery', 'BAT-10KWH', '锂电池 10kWh', JSON_OBJECT('capacity', 10, 'type', 'lithium'), 3400.00, '组', 'active'
  UNION ALL SELECT 'mount', 'MOUNT-ROOF', '屋顶支架（每 kW）', JSON_OBJECT('type', 'rooftop'), 45.00, 'kW', 'active'
  UNION ALL SELECT 'mount', 'MOUNT-GROUND', '地面支架（每 kW）', JSON_OBJECT('type', 'ground'), 65.00, 'kW', 'active'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM products WHERE model = seed.model);

-- 3. 示例套餐：户用 5kW 并网套餐
INSERT INTO products (category, model, name, specs, price, unit, status, is_package)
SELECT 'package', 'PKG-HOME-5K', '户用 5kW 并网套餐', JSON_OBJECT('capacity_kw', 5), 0, '套', 'active', 1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE model = 'PKG-HOME-5K');

-- 套餐组成（依赖上面的产品 ID，用子查询）
INSERT INTO package_items (package_id, product_id, qty)
SELECT
  (SELECT id FROM products WHERE model = 'PKG-HOME-5K' LIMIT 1),
  (SELECT id FROM products WHERE model = 'PANEL-550W' LIMIT 1),
  10
WHERE NOT EXISTS (
  SELECT 1 FROM package_items
  WHERE package_id = (SELECT id FROM products WHERE model = 'PKG-HOME-5K' LIMIT 1)
    AND product_id = (SELECT id FROM products WHERE model = 'PANEL-550W' LIMIT 1)
);

INSERT INTO package_items (package_id, product_id, qty)
SELECT
  (SELECT id FROM products WHERE model = 'PKG-HOME-5K' LIMIT 1),
  (SELECT id FROM products WHERE model = 'INV-5K' LIMIT 1),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM package_items
  WHERE package_id = (SELECT id FROM products WHERE model = 'PKG-HOME-5K' LIMIT 1)
    AND product_id = (SELECT id FROM products WHERE model = 'INV-5K' LIMIT 1)
);

INSERT INTO package_items (package_id, product_id, qty)
SELECT
  (SELECT id FROM products WHERE model = 'PKG-HOME-5K' LIMIT 1),
  (SELECT id FROM products WHERE model = 'MOUNT-ROOF' LIMIT 1),
  5
WHERE NOT EXISTS (
  SELECT 1 FROM package_items
  WHERE package_id = (SELECT id FROM products WHERE model = 'PKG-HOME-5K' LIMIT 1)
    AND product_id = (SELECT id FROM products WHERE model = 'MOUNT-ROOF' LIMIT 1)
);

-- 4. 示例套餐：咖啡厅 10kW 混合套餐（含电池）
INSERT INTO products (category, model, name, specs, price, unit, status, is_package)
SELECT 'package', 'PKG-CAFE-10K-HYB', '咖啡厅 10kW 混合套餐', JSON_OBJECT('capacity_kw', 10, 'battery_kwh', 10), 0, '套', 'active', 1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE model = 'PKG-CAFE-10K-HYB');

INSERT INTO package_items (package_id, product_id, qty)
SELECT
  (SELECT id FROM products WHERE model = 'PKG-CAFE-10K-HYB' LIMIT 1),
  (SELECT id FROM products WHERE model = 'PANEL-550W' LIMIT 1),
  19
WHERE NOT EXISTS (
  SELECT 1 FROM package_items
  WHERE package_id = (SELECT id FROM products WHERE model = 'PKG-CAFE-10K-HYB' LIMIT 1)
    AND product_id = (SELECT id FROM products WHERE model = 'PANEL-550W' LIMIT 1)
);

INSERT INTO package_items (package_id, product_id, qty)
SELECT
  (SELECT id FROM products WHERE model = 'PKG-CAFE-10K-HYB' LIMIT 1),
  (SELECT id FROM products WHERE model = 'INV-HYB-8K' LIMIT 1),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM package_items
  WHERE package_id = (SELECT id FROM products WHERE model = 'PKG-CAFE-10K-HYB' LIMIT 1)
    AND product_id = (SELECT id FROM products WHERE model = 'INV-HYB-8K' LIMIT 1)
);

INSERT INTO package_items (package_id, product_id, qty)
SELECT
  (SELECT id FROM products WHERE model = 'PKG-CAFE-10K-HYB' LIMIT 1),
  (SELECT id FROM products WHERE model = 'BAT-10KWH' LIMIT 1),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM package_items
  WHERE package_id = (SELECT id FROM products WHERE model = 'PKG-CAFE-10K-HYB' LIMIT 1)
    AND product_id = (SELECT id FROM products WHERE model = 'BAT-10KWH' LIMIT 1)
);

INSERT INTO package_items (package_id, product_id, qty)
SELECT
  (SELECT id FROM products WHERE model = 'PKG-CAFE-10K-HYB' LIMIT 1),
  (SELECT id FROM products WHERE model = 'MOUNT-ROOF' LIMIT 1),
  10
WHERE NOT EXISTS (
  SELECT 1 FROM package_items
  WHERE package_id = (SELECT id FROM products WHERE model = 'PKG-CAFE-10K-HYB' LIMIT 1)
    AND product_id = (SELECT id FROM products WHERE model = 'MOUNT-ROOF' LIMIT 1)
);
