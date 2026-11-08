-- Normalize legacy Cambodian local phone numbers (leading 0) to E.164 form so
-- that phone numbers stay unique across username/email/phone identities.
UPDATE users
SET phone = CONCAT('+855', SUBSTRING(phone, 2)),
    phone_country = COALESCE(phone_country, 'KH')
WHERE phone REGEXP '^0[0-9]+$'
  AND phone IS NOT NULL;
