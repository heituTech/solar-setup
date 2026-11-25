-- 组织架构：部门、职位与人员分离，职位可以空缺
-- 层级：1 总经理；2 部门经理；3 员工
CREATE TABLE IF NOT EXISTS org_departments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_org_departments_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS org_positions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  level TINYINT NOT NULL,
  role_key VARCHAR(40) NULL,
  parent_id BIGINT UNSIGNED NULL,
  single_holder TINYINT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_org_positions_department (department_id),
  KEY idx_org_positions_parent (parent_id),
  KEY idx_org_positions_role (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users
  ADD COLUMN position_id BIGINT UNSIGNED NULL AFTER manager_id,
  ADD KEY idx_users_position (position_id);

-- 标准组织架构（固定种子）
INSERT IGNORE INTO org_departments (id, code, name, sort_order) VALUES
  (1, 'company', '总公司', 1),
  (2, 'engineering', '工程部', 2),
  (3, 'sales', '市场销售部', 3),
  (4, 'finance', '财务部', 4),
  (5, 'hr', '人力资源部', 5);

INSERT IGNORE INTO org_positions (id, department_id, name, level, role_key, parent_id, single_holder, sort_order) VALUES
  (1, 1, '总经理', 1, 'super_admin', NULL, 1, 1),
  (2, 2, '工程部门经理', 2, 'engineering_manager', 1, 1, 2),
  (3, 3, '市场销售部门经理', 2, 'sales_manager', 1, 1, 3),
  (4, 4, '财务部门经理', 2, 'finance_manager', 1, 1, 4),
  (5, 5, '人力资源部门经理', 2, 'hr_manager', 1, 1, 5),
  (6, 3, '销售人员', 3, 'salesperson', 3, 0, 6),
  (7, 2, '电气工程师', 3, 'electrical_engineer', 2, 0, 7),
  (8, 2, '结构工程师', 3, 'structural_engineer', 2, 0, 8),
  (9, 4, '会计', 3, 'accountant', 4, 0, 9);

-- 现有账号按角色回填职位，未回填的保持空缺
UPDATE users u
JOIN org_positions p ON p.role_key = u.role
SET u.position_id = p.id
WHERE u.position_id IS NULL AND u.role <> 'member';
