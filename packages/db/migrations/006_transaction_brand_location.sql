-- BookOne v2 - Brand/location dimensions for management accounting.
-- Nullable for old production rows; enforced in application for new Simple Entry rows when dimensions exist.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id),
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id);

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id),
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id);

ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id),
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id);

CREATE INDEX IF NOT EXISTS idx_transactions_tenant_brand ON transactions(tenant_id, brand_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_location ON transactions(tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_brand ON journal_entries(tenant_id, brand_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_location ON journal_entries(tenant_id, location_id);
