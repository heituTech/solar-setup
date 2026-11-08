-- Login identities: username / email / phone are all unique.
-- phone stores an E.164-style value (e.g. +85512345678); phone_country keeps the ISO2 code for flags.
ALTER TABLE users
  ADD COLUMN phone_country VARCHAR(2) DEFAULT NULL AFTER phone;

ALTER TABLE users
  ADD UNIQUE KEY uq_users_phone (phone);

-- Email verification codes can now also be used to log in.
ALTER TABLE email_codes
  MODIFY COLUMN purpose ENUM('register','login') NOT NULL DEFAULT 'register';
