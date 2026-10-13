-- One live reversing transaction per original (BUG-0015).
CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_reversal_per_original_uidx
  ON transactions (tenant_id, reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL AND voided_at IS NULL;
