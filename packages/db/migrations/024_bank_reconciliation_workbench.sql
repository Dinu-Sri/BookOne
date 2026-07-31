-- Bank Reconciliation Workbench (session + cases)
-- Additive. Preserves bank_statement_* staging tables.

CREATE TABLE IF NOT EXISTS bank_reconciliation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  bank_account_id UUID NOT NULL REFERENCES accounts(id),
  book_domain VARCHAR(20),
  period_from VARCHAR(10) NOT NULL,
  period_to VARCHAR(10) NOT NULL,
  statement_reference VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'ready',
  statement_opening_balance NUMERIC(18, 2),
  statement_closing_balance NUMERIC(18, 2),
  book_opening_balance_snapshot NUMERIC(18, 2),
  book_closing_balance_snapshot NUMERIC(18, 2),
  outstanding_net NUMERIC(18, 2) NOT NULL DEFAULT 0,
  adjustment_net NUMERIC(18, 2) NOT NULL DEFAULT 0,
  difference_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  tolerance_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.01,
  source_file_count INTEGER NOT NULL DEFAULT 0,
  bank_line_count INTEGER NOT NULL DEFAULT 0,
  resolved_case_count INTEGER NOT NULL DEFAULT 0,
  open_case_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  prepared_by UUID REFERENCES users(id),
  reconciled_by UUID REFERENCES users(id),
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_recon_sessions_unique_active
  ON bank_reconciliation_sessions (tenant_id, bank_account_id, period_from, period_to)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS bank_recon_sessions_tenant_idx
  ON bank_reconciliation_sessions (tenant_id, updated_at DESC)
  WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS bank_reconciliation_session_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  session_id UUID NOT NULL REFERENCES bank_reconciliation_sessions(id),
  import_id UUID NOT NULL REFERENCES bank_statement_imports(id),
  attached_by UUID REFERENCES users(id),
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, import_id)
);

CREATE INDEX IF NOT EXISTS bank_recon_session_imports_import_idx
  ON bank_reconciliation_session_imports (import_id);

CREATE TABLE IF NOT EXISTS bank_reconciliation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  session_id UUID NOT NULL REFERENCES bank_reconciliation_sessions(id),
  case_type VARCHAR(40) NOT NULL,
  confidence VARCHAR(20) NOT NULL DEFAULT 'none',
  state VARCHAR(30) NOT NULL DEFAULT 'suggested',
  match_score NUMERIC(5, 4),
  match_method VARCHAR(20),
  explanation TEXT,
  reason_codes JSONB NOT NULL DEFAULT '[]',
  user_label VARCHAR(80),
  result_label VARCHAR(80),
  created_transaction_id UUID REFERENCES transactions(id),
  exclusion_reason VARCHAR(80),
  deferred_until VARCHAR(10),
  sort_date VARCHAR(10),
  sort_amount NUMERIC(18, 2),
  version INTEGER NOT NULL DEFAULT 1,
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS bank_recon_cases_session_idx
  ON bank_reconciliation_cases (session_id, state)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS bank_recon_cases_tenant_idx
  ON bank_reconciliation_cases (tenant_id)
  WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS bank_reconciliation_case_bank_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  case_id UUID NOT NULL REFERENCES bank_reconciliation_cases(id),
  bank_line_id UUID NOT NULL REFERENCES bank_statement_lines(id),
  allocated_amount NUMERIC(18, 2),
  role VARCHAR(30) NOT NULL DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ,
  UNIQUE (case_id, bank_line_id)
);

CREATE INDEX IF NOT EXISTS bank_recon_case_bank_lines_line_idx
  ON bank_reconciliation_case_bank_lines (bank_line_id)
  WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS bank_reconciliation_case_book_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  case_id UUID NOT NULL REFERENCES bank_reconciliation_cases(id),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  allocated_amount NUMERIC(18, 2),
  role VARCHAR(30) NOT NULL DEFAULT 'primary',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ,
  UNIQUE (case_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS bank_recon_case_book_tx_idx
  ON bank_reconciliation_case_book_transactions (transaction_id)
  WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS bank_reconciliation_outstanding_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  session_id UUID NOT NULL REFERENCES bank_reconciliation_sessions(id),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  case_id UUID REFERENCES bank_reconciliation_cases(id),
  reason VARCHAR(40) NOT NULL DEFAULT 'not_cleared',
  expected_clear_date VARCHAR(10),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS bank_recon_outstanding_session_idx
  ON bank_reconciliation_outstanding_items (session_id)
  WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS bank_reconciliation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  session_id UUID NOT NULL REFERENCES bank_reconciliation_sessions(id),
  case_id UUID REFERENCES bank_reconciliation_cases(id),
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(40) NOT NULL,
  before_values JSONB,
  after_values JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bank_recon_events_session_idx
  ON bank_reconciliation_events (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bank_reconciliation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  session_id UUID NOT NULL REFERENCES bank_reconciliation_sessions(id),
  summary JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS (same tenant pattern as other recon tables)
ALTER TABLE bank_reconciliation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_session_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_case_bank_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_case_book_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_outstanding_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation_sessions' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON bank_reconciliation_sessions
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation_session_imports' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON bank_reconciliation_session_imports
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation_cases' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON bank_reconciliation_cases
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation_case_bank_lines' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON bank_reconciliation_case_bank_lines
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation_case_book_transactions' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON bank_reconciliation_case_book_transactions
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation_outstanding_items' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON bank_reconciliation_outstanding_items
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation_events' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON bank_reconciliation_events
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliation_snapshots' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON bank_reconciliation_snapshots
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

COMMENT ON TABLE bank_reconciliation_sessions IS 'Workbench session: bank account + statement period';
COMMENT ON TABLE bank_reconciliation_cases IS 'One recon decision unit (match / create / outstanding / exclude)';
