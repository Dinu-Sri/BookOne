-- Statement import engine: multi-bank, fingerprint, profiles, decision audit
-- Additive — existing reconciliation wizard continues to work.

-- Imports: bind bank + domain + file identity
ALTER TABLE bank_statement_imports
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES accounts(id),
  ADD COLUMN IF NOT EXISTS book_domain varchar(20),
  ADD COLUMN IF NOT EXISTS file_sha256 varchar(64),
  ADD COLUMN IF NOT EXISTS storage_key varchar(500),
  ADD COLUMN IF NOT EXISTS period_from varchar(10),
  ADD COLUMN IF NOT EXISTS period_to varchar(10),
  ADD COLUMN IF NOT EXISTS parser_profile_id uuid,
  ADD COLUMN IF NOT EXISTS source varchar(20) DEFAULT 'erp_recon';

COMMENT ON COLUMN bank_statement_imports.bank_account_id IS 'Liquid CoA account this statement belongs to';
COMMENT ON COLUMN bank_statement_imports.book_domain IS 'personal | business | null (company)';
COMMENT ON COLUMN bank_statement_imports.file_sha256 IS 'SHA-256 of original file bytes for idempotent re-upload';
COMMENT ON COLUMN bank_statement_imports.source IS 'cashbook | erp_recon';

CREATE INDEX IF NOT EXISTS bank_statement_imports_file_sha_idx
  ON bank_statement_imports (tenant_id, bank_account_id, file_sha256)
  WHERE voided_at IS NULL AND file_sha256 IS NOT NULL;

-- Lines: match quality + create rail
ALTER TABLE bank_statement_lines
  ADD COLUMN IF NOT EXISTS fingerprint varchar(64),
  ADD COLUMN IF NOT EXISTS direction varchar(10),
  ADD COLUMN IF NOT EXISTS balance_after numeric(18, 2),
  ADD COLUMN IF NOT EXISTS external_ref varchar(100),
  ADD COLUMN IF NOT EXISTS match_score numeric(5, 4),
  ADD COLUMN IF NOT EXISTS match_method varchar(20),
  ADD COLUMN IF NOT EXISTS match_candidates jsonb,
  ADD COLUMN IF NOT EXISTS proposed_action varchar(20) DEFAULT 'review',
  ADD COLUMN IF NOT EXISTS created_transaction_id uuid REFERENCES transactions(id),
  ADD COLUMN IF NOT EXISTS confidence numeric(5, 4);

COMMENT ON COLUMN bank_statement_lines.fingerprint IS 'Idempotency key within tenant+bank';
COMMENT ON COLUMN bank_statement_lines.proposed_action IS 'link | create | skip | review | duplicate';
COMMENT ON COLUMN bank_statement_lines.direction IS 'in | out | unknown';

CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_fingerprint_uidx
  ON bank_statement_lines (tenant_id, fingerprint)
  WHERE voided_at IS NULL AND fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_statement_lines_import_status_idx
  ON bank_statement_lines (tenant_id, import_id, status)
  WHERE voided_at IS NULL;

-- Column map profiles (system + tenant-learned)
CREATE TABLE IF NOT EXISTS bank_statement_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  name varchar(120) NOT NULL,
  bank_hint varchar(120),
  column_map jsonb NOT NULL DEFAULT '{}',
  sign_convention varchar(40) NOT NULL DEFAULT 'signed_amount',
  date_format_hint varchar(40),
  skip_rows integer NOT NULL DEFAULT 0,
  sheet_name varchar(120),
  success_count integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);

COMMENT ON TABLE bank_statement_profiles IS 'Built-in (tenant_id null) or tenant-learned bank export layouts';
COMMENT ON COLUMN bank_statement_profiles.sign_convention IS 'signed_amount | debit_credit | credit_debit';

CREATE INDEX IF NOT EXISTS bank_statement_profiles_tenant_idx
  ON bank_statement_profiles (tenant_id)
  WHERE voided_at IS NULL;

-- Decision audit
CREATE TABLE IF NOT EXISTS bank_statement_import_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  import_id uuid NOT NULL REFERENCES bank_statement_imports(id),
  user_id uuid NOT NULL REFERENCES users(id),
  line_id uuid REFERENCES bank_statement_lines(id),
  action varchar(40) NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_statement_import_events_import_idx
  ON bank_statement_import_events (tenant_id, import_id, created_at DESC);

-- RLS
ALTER TABLE bank_statement_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_import_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bank_statement_profiles' AND policyname = 'bank_statement_profiles_isolation'
  ) THEN
    CREATE POLICY bank_statement_profiles_isolation ON bank_statement_profiles
      USING (
        tenant_id IS NULL
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      )
      WITH CHECK (
        tenant_id IS NULL
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bank_statement_import_events' AND policyname = 'bank_statement_import_events_isolation'
  ) THEN
    CREATE POLICY bank_statement_import_events_isolation ON bank_statement_import_events
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;
