-- Email verification codes can also confirm phone/email changes from the account page.
ALTER TABLE email_codes
  MODIFY COLUMN purpose ENUM('register','login','profile') NOT NULL DEFAULT 'register';
