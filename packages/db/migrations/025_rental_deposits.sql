-- Rental Phase 4: track deposits on the event and a default late-fee helper.

ALTER TABLE rental_events
  ADD COLUMN IF NOT EXISTS deposit_held numeric(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE rental_events
  ADD COLUMN IF NOT EXISTS deposit_applied numeric(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE rental_events
  ADD COLUMN IF NOT EXISTS deposit_refunded numeric(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE rental_settings
  ADD COLUMN IF NOT EXISTS default_late_fee_per_day numeric(18, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN rental_events.deposit_held IS 'Customer deposits collected (liability 2400).';
COMMENT ON COLUMN rental_events.deposit_applied IS 'Deposit applied to hire/damage invoices.';
COMMENT ON COLUMN rental_events.deposit_refunded IS 'Deposit paid back to the customer.';
COMMENT ON COLUMN rental_settings.default_late_fee_per_day IS 'Suggested late fee per overdue day on return.';
