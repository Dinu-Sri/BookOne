-- Entity tiers: personal | sole_prop | company + book_domain on postings

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS entity_kind varchar(20) NOT NULL DEFAULT 'company';

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS capability_tier varchar(20);

COMMENT ON COLUMN tenants.entity_kind IS 'personal | sole_prop | company | pending (onboarding)';
COMMENT ON COLUMN tenants.capability_tier IS 'lite | full (sole_prop); null otherwise';

-- Existing rows stay company; new signups may set pending until onboarding

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS book_domain varchar(20);

ALTER TABLE business_documents
  ADD COLUMN IF NOT EXISTS book_domain varchar(20);

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS book_domain varchar(20);

COMMENT ON COLUMN transactions.book_domain IS 'personal | business';
COMMENT ON COLUMN business_documents.book_domain IS 'personal | business';
COMMENT ON COLUMN journal_entries.book_domain IS 'personal | business';

CREATE INDEX IF NOT EXISTS transactions_tenant_domain_idx
  ON transactions (tenant_id, book_domain)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS journal_entries_tenant_domain_idx
  ON journal_entries (tenant_id, book_domain)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS tenants_entity_kind_idx ON tenants (entity_kind);
