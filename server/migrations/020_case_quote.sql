ALTER TABLE cases
  ADD COLUMN quote_input JSON DEFAULT NULL AFTER electricity_price_currency,
  ADD COLUMN quote_result JSON DEFAULT NULL AFTER quote_input,
  ADD COLUMN quote_saved_at TIMESTAMP NULL DEFAULT NULL AFTER quote_result,
  ADD COLUMN quote_catalog_ts TIMESTAMP NULL DEFAULT NULL AFTER quote_saved_at;
