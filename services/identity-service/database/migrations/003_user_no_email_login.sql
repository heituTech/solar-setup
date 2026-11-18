ALTER TABLE users ADD COLUMN user_no VARCHAR(20) NULL AFTER id;
ALTER TABLE users ADD UNIQUE KEY uk_users_user_no (user_no);

SET @seq = 0;
UPDATE users SET user_no = CONCAT('P', LPAD(@seq := @seq + 1, 6, '0')) WHERE user_no IS NULL ORDER BY id;

ALTER TABLE users MODIFY COLUMN user_no VARCHAR(20) NOT NULL;

ALTER TABLE email_codes MODIFY COLUMN code VARCHAR(64) NOT NULL;
ALTER TABLE email_codes ADD COLUMN attempts INT NOT NULL DEFAULT 0;
ALTER TABLE email_codes ADD COLUMN ip VARCHAR(64) NULL;
