-- Guest quote battery pricing: unit price per kWh by battery chemistry.
-- Member quotes keep using the real catalog product price.
INSERT INTO system_config (config_key, config_value) VALUES
  ('battery_price_lfp_per_kwh', '120'),
  ('battery_price_ternary_per_kwh', '120'),
  ('battery_price_lead_acid_per_kwh', '85')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);
