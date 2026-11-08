-- Power ratings become integers (watts)
ALTER TABLE inverters MODIFY COLUMN rated_power INT NOT NULL COMMENT 'W';
ALTER TABLE solar_panels MODIFY COLUMN rated_power INT NOT NULL COMMENT 'W';
