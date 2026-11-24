-- 商品分类统一用英文存储（旧值 → 新英文值）
-- battery 保持不变；package / survey_service 为系统内部分类，保持不变
UPDATE products SET category = 'PV module'              WHERE category IN ('panel');
UPDATE products SET category = 'Invertor'               WHERE category IN ('inverter');
UPDATE products SET category = 'mounting bracket'       WHERE category IN ('mount', 'mounting');
UPDATE products SET category = 'Cable'                  WHERE category IN ('cable');
UPDATE products SET category = 'Other'                  WHERE category IN ('accessory', 'service');
