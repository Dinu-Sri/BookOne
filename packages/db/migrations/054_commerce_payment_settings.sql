-- Commerce payment settings: which BookOne account settles paid web orders, per
-- store connection and per payment method the store sends (any gateway, bank
-- transfer, COD). Orders record the account they settled into. Idempotent.

ALTER TABLE commerce_connections
  ADD COLUMN IF NOT EXISTS payment_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE commerce_orders
  ADD COLUMN IF NOT EXISTS settlement_account_code varchar(20);
