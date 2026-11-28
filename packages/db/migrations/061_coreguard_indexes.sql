-- 061_coreguard_indexes.sql
-- Indexes the guards and checks need, plus two uniqueness rules.
-- Plain CREATE INDEX (init-db sends each file as one implicit transaction, so CONCURRENTLY is not possible).

CREATE INDEX IF NOT EXISTS cg_jl_entry_idx          ON journal_lines   (journal_entry_id);
CREATE INDEX IF NOT EXISTS cg_jl_tenant_acct_idx    ON journal_lines   (tenant_id, account_id);
CREATE INDEX IF NOT EXISTS cg_je_tenant_tx_idx      ON journal_entries (tenant_id, transaction_id);
CREATE INDEX IF NOT EXISTS cg_je_tenant_date_idx    ON journal_entries (tenant_id, entry_date);
CREATE INDEX IF NOT EXISTS cg_je_tenant_created_idx ON journal_entries (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS cg_bd_tenant_type_idx    ON business_documents (tenant_id, document_type, status);
CREATE INDEX IF NOT EXISTS cg_im_tenant_prod_idx    ON inventory_movements (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS cg_sa_tenant_inv_idx     ON settlement_allocations (tenant_id, invoice_transaction_id);
CREATE INDEX IF NOT EXISTS cg_sa_tenant_pay_idx     ON settlement_allocations (tenant_id, payment_transaction_id);

-- Exactly one live journal entry per transaction (with G07 "at least one", this makes "exactly one").
CREATE UNIQUE INDEX IF NOT EXISTS cg_one_live_entry_per_tx
  ON journal_entries (transaction_id) WHERE voided_at IS NULL;

-- One active lock per tenant and period.
CREATE UNIQUE INDEX IF NOT EXISTS cg_period_locks_active_uidx
  ON period_locks (tenant_id, period) WHERE status = 'locked' AND voided_at IS NULL;
