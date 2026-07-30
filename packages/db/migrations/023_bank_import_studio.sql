-- Smart Bank Import Studio foundations (additive on 022)
-- Draft wizard state, profile versions, richer bank lines, issues.

-- ─── Profile versions (never mutate approved in place) ───
CREATE TABLE IF NOT EXISTS bank_statement_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  profile_id uuid NOT NULL REFERENCES bank_statement_profiles(id),
  version_number integer NOT NULL DEFAULT 1,
  status varchar(20) NOT NULL DEFAULT 'draft',
  column_mappings jsonb NOT NULL DEFAULT '{}',
  amount_rules jsonb NOT NULL DEFAULT '{}',
  date_rules jsonb NOT NULL DEFAULT '{}',
  row_filters jsonb NOT NULL DEFAULT '[]',
  structure_fingerprint jsonb NOT NULL DEFAULT '{}',
  sample_signatures jsonb,
  notes text,
  created_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  superseded_at timestamptz,
  voided_at timestamptz,
  UNIQUE (profile_id, version_number)
);

COMMENT ON TABLE bank_statement_profile_versions IS 'Versioned import rules for Smart Bank Import Studio';
COMMENT ON COLUMN bank_statement_profile_versions.status IS 'draft | approved | superseded | disabled';

CREATE INDEX IF NOT EXISTS bank_statement_profile_versions_profile_idx
  ON bank_statement_profile_versions (tenant_id, profile_id, version_number DESC)
  WHERE voided_at IS NULL;

-- ─── Import batch: wizard + balance totals ───
ALTER TABLE bank_statement_imports
  ADD COLUMN IF NOT EXISTS wizard_status varchar(20) DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS wizard_step varchar(40),
  ADD COLUMN IF NOT EXISTS draft_payload jsonb,
  ADD COLUMN IF NOT EXISTS draft_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_fingerprint varchar(64),
  ADD COLUMN IF NOT EXISTS opening_balance numeric(18, 2),
  ADD COLUMN IF NOT EXISTS closing_balance numeric(18, 2),
  ADD COLUMN IF NOT EXISTS total_money_in numeric(18, 2),
  ADD COLUMN IF NOT EXISTS total_money_out numeric(18, 2),
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(80),
  ADD COLUMN IF NOT EXISTS profile_version_id uuid REFERENCES bank_statement_profile_versions(id);

COMMENT ON COLUMN bank_statement_imports.wizard_status IS 'open | draft | ready | committed | voided | rolled_back';
COMMENT ON COLUMN bank_statement_imports.draft_payload IS 'Studio wizard selections (versioned with draft_version)';
COMMENT ON COLUMN bank_statement_imports.content_fingerprint IS 'Set-level fingerprint beyond file bytes';

CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_imports_idempotency_uidx
  ON bank_statement_imports (tenant_id, idempotency_key)
  WHERE voided_at IS NULL AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_statement_imports_wizard_status_idx
  ON bank_statement_imports (tenant_id, wizard_status, updated_at DESC)
  WHERE voided_at IS NULL;

-- ─── Lines: validation + recon status ───
ALTER TABLE bank_statement_lines
  ADD COLUMN IF NOT EXISTS value_date varchar(10),
  ADD COLUMN IF NOT EXISTS debit_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS credit_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS validation_status varchar(20) DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS validation_messages jsonb,
  ADD COLUMN IF NOT EXISTS source_row_hash varchar(64),
  ADD COLUMN IF NOT EXISTS transform_log jsonb,
  ADD COLUMN IF NOT EXISTS reconciliation_status varchar(20) DEFAULT 'unmatched';

COMMENT ON COLUMN bank_statement_lines.validation_status IS 'valid | warning | error | excluded';
COMMENT ON COLUMN bank_statement_lines.reconciliation_status IS 'unmatched | suggested | matched | ignored';

CREATE INDEX IF NOT EXISTS bank_statement_lines_validation_idx
  ON bank_statement_lines (tenant_id, import_id, validation_status)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS bank_statement_lines_recon_idx
  ON bank_statement_lines (tenant_id, import_id, reconciliation_status)
  WHERE voided_at IS NULL;

-- ─── Issues (one-at-a-time fix UX) ───
CREATE TABLE IF NOT EXISTS bank_import_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  import_id uuid NOT NULL REFERENCES bank_statement_imports(id),
  line_id uuid REFERENCES bank_statement_lines(id),
  issue_type varchar(40) NOT NULL,
  severity varchar(20) NOT NULL DEFAULT 'error',
  status varchar(20) NOT NULL DEFAULT 'open',
  title varchar(255) NOT NULL,
  detail jsonb,
  resolution varchar(40),
  resolution_detail jsonb,
  apply_to_similar boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);

COMMENT ON TABLE bank_import_issues IS 'Studio blocking/warning issues for guided resolution';

CREATE INDEX IF NOT EXISTS bank_import_issues_import_idx
  ON bank_import_issues (tenant_id, import_id, status)
  WHERE voided_at IS NULL;

-- ─── Profile: bind to bank account optionally ───
ALTER TABLE bank_statement_profiles
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES accounts(id),
  ADD COLUMN IF NOT EXISTS current_version_id uuid,
  ADD COLUMN IF NOT EXISTS profile_status varchar(20) DEFAULT 'active';

-- ─── RLS ───
ALTER TABLE bank_statement_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_import_issues ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bank_statement_profile_versions'
      AND policyname = 'bank_statement_profile_versions_isolation'
  ) THEN
    CREATE POLICY bank_statement_profile_versions_isolation ON bank_statement_profile_versions
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bank_import_issues'
      AND policyname = 'bank_import_issues_isolation'
  ) THEN
    CREATE POLICY bank_import_issues_isolation ON bank_import_issues
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;
