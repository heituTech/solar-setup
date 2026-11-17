-- Replace all four placeholders before running this file as MySQL root.
-- Never commit the edited file or real passwords.
CREATE USER IF NOT EXISTS 'solar_identity'@'localhost' IDENTIFIED BY 'REPLACE_IDENTITY_PASSWORD';
CREATE USER IF NOT EXISTS 'solar_sales'@'localhost' IDENTIFIED BY 'REPLACE_SALES_PASSWORD';
CREATE USER IF NOT EXISTS 'solar_delivery'@'localhost' IDENTIFIED BY 'REPLACE_DELIVERY_PASSWORD';
CREATE USER IF NOT EXISTS 'solar_finance'@'localhost' IDENTIFIED BY 'REPLACE_FINANCE_PASSWORD';
ALTER USER 'solar_identity'@'localhost' IDENTIFIED BY 'REPLACE_IDENTITY_PASSWORD';
ALTER USER 'solar_sales'@'localhost' IDENTIFIED BY 'REPLACE_SALES_PASSWORD';
ALTER USER 'solar_delivery'@'localhost' IDENTIFIED BY 'REPLACE_DELIVERY_PASSWORD';
ALTER USER 'solar_finance'@'localhost' IDENTIFIED BY 'REPLACE_FINANCE_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON solar_identity.* TO 'solar_identity'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON solar_sales.* TO 'solar_sales'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON solar_delivery.* TO 'solar_delivery'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON solar_finance.* TO 'solar_finance'@'localhost';
FLUSH PRIVILEGES;
