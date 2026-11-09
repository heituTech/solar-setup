-- Allow verification codes for changing the login password.
ALTER TABLE email_codes
  MODIFY COLUMN purpose ENUM('register','login','profile','password') NOT NULL;
