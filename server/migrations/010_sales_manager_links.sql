-- Salesperson -> sales manager mapping via join table (replaces users.manager_id)
CREATE TABLE IF NOT EXISTS sales_manager_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  manager_id INT NOT NULL,
  salesperson_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sml_salesperson (salesperson_id),
  KEY idx_sml_manager (manager_id),
  CONSTRAINT fk_sml_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sml_salesperson FOREIGN KEY (salesperson_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT IGNORE INTO sales_manager_links (manager_id, salesperson_id)
SELECT manager_id, id FROM users WHERE role = 'salesperson' AND manager_id IS NOT NULL;

ALTER TABLE users DROP FOREIGN KEY fk_users_manager;
ALTER TABLE users DROP INDEX idx_users_manager;
ALTER TABLE users DROP COLUMN manager_id;
