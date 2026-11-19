-- COA-01: company Chart of Accounts metadata, advances and opening balances.
-- Additive. Existing account ids/codes/journals stay. Custom 1101–1199 banks
-- classify as bank. Restore LAST.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS subtype varchar(40);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS purpose varchar(40);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_group varchar(1) NOT NULL DEFAULT '0';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_system varchar(1) NOT NULL DEFAULT '0';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_contra varchar(1) NOT NULL DEFAULT '0';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cash_flow_class varchar(40);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS liquidity varchar(40);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS reconcilable varchar(1) NOT NULL DEFAULT '0';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS control_role varchar(40);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS institution varchar(120);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_digits varchar(8);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_tenant_code_lower_uidx
  ON accounts (tenant_id, lower(code));

CREATE UNIQUE INDEX IF NOT EXISTS accounts_tenant_active_name_uidx
  ON accounts (tenant_id, lower(name))
  WHERE is_active = '1' AND voided_at IS NULL;

UPDATE accounts SET
  subtype = CASE
    WHEN code ~ '^10[0-9]{2}$' THEN 'cash'
    WHEN code ~ '^11[0-9]{2}$' THEN 'bank'
    WHEN code ~ '^12[0-9]{2}$' THEN 'card_clearing'
    WHEN code = '1300' THEN 'receivable'
    WHEN code = '1350' THEN 'supplier_advance'
    WHEN code = '1360' THEN 'staff_advance'
    WHEN code = '1400' THEN 'other_asset'
    WHEN code = '2100' THEN 'payable'
    WHEN code = '2150' THEN 'grni'
    WHEN code = '2200' THEN 'output_tax'
    WHEN code = '2300' THEN 'input_tax'
    WHEN code = '2400' THEN 'deposit'
    WHEN code = '2410' THEN 'customer_advance'
    WHEN code = '2500' THEN 'loan'
    WHEN code = '3000' THEN 'equity'
    WHEN code = '3100' THEN 'drawings'
    WHEN code = '4000' THEN 'sales'
    WHEN code = '4100' THEN 'sales_return'
    WHEN code IN ('4200', '4300', '4400', '4450') THEN 'other_income'
    WHEN code = '5000' THEN 'cogs'
    WHEN code = '5100' THEN 'inventory'
    WHEN type = 'expense' THEN 'operating_expense'
    WHEN type = 'asset' THEN 'other_asset'
    WHEN type = 'liability' THEN 'other_liability'
    WHEN type = 'equity' THEN 'equity'
    WHEN type = 'revenue' THEN 'other_income'
    ELSE COALESCE(subtype, 'other_asset')
  END,
  purpose = CASE
    WHEN code ~ '^10[0-9]{2}$' OR code ~ '^11[0-9]{2}$' THEN 'tender'
    WHEN code ~ '^12[0-9]{2}$' THEN 'clearing'
    WHEN code IN ('1350', '1360', '2410') THEN 'advance'
    WHEN code = '2400' THEN 'deposit'
    ELSE COALESCE(purpose, 'general')
  END,
  liquidity = CASE
    WHEN code ~ '^10[0-9]{2}$' THEN 'cash'
    WHEN code ~ '^11[0-9]{2}$' THEN 'bank'
    WHEN code ~ '^12[0-9]{2}$' THEN 'card_clearing'
    ELSE COALESCE(NULLIF(liquidity, ''), 'none')
  END,
  cash_flow_class = CASE
    WHEN code IN ('3000', '3100', '1400', '2500') THEN 'financing'
    ELSE COALESCE(NULLIF(cash_flow_class, ''), 'operating')
  END,
  reconcilable = CASE
    WHEN code ~ '^10[0-9]{2}$' OR code ~ '^11[0-9]{2}$' OR code ~ '^12[0-9]{2}$' THEN '1'
    ELSE COALESCE(reconcilable, '0')
  END,
  is_system = CASE
    WHEN code IN (
      '1000', '1100', '1200', '1300', '1350', '1360', '2100', '2150', '2200', '2300',
      '2400', '2410', '3000', '3100', '4000', '4100', '4400', '4450', '5000', '5100', '5150'
    ) THEN '1'
    ELSE COALESCE(is_system, '0')
  END,
  is_contra = CASE
    WHEN code IN ('2300', '3100', '4100') THEN '1'
    ELSE COALESCE(is_contra, '0')
  END,
  control_role = CASE
    WHEN code ~ '^10[0-9]{2}$' THEN 'cash'
    WHEN code ~ '^11[0-9]{2}$' THEN 'bank'
    WHEN code ~ '^12[0-9]{2}$' THEN 'card_clearing'
    WHEN code = '1300' THEN 'ar'
    WHEN code = '1350' THEN 'supplier_advance'
    WHEN code = '1360' THEN 'staff_advance'
    WHEN code = '2100' THEN 'ap'
    WHEN code = '2150' THEN 'grni'
    WHEN code = '2200' THEN 'vat_output'
    WHEN code = '2300' THEN 'vat_input'
    WHEN code = '2400' THEN 'deposit'
    WHEN code = '2410' THEN 'customer_advance'
    WHEN code = '3000' THEN 'equity'
    WHEN code = '3100' THEN 'drawings'
    WHEN code = '4000' THEN 'sales'
    WHEN code = '4100' THEN 'sales_return'
    WHEN code = '5000' THEN 'cogs'
    WHEN code = '5100' THEN 'inventory'
    ELSE COALESCE(NULLIF(control_role, ''), 'none')
  END
WHERE subtype IS NULL OR subtype = '' OR liquidity IS NULL OR liquidity = '';

INSERT INTO accounts (tenant_id, code, name, type, normal_side, subtype, purpose, is_group, is_system, is_contra, cash_flow_class, liquidity, reconcilable, control_role)
SELECT t.tenant_id, v.code, v.name, v.type, v.normal_side, v.subtype, v.purpose, '0', '1', '0', 'operating', 'none', '0', v.control_role
FROM (SELECT DISTINCT tenant_id FROM accounts WHERE code = '1300' AND voided_at IS NULL) t
CROSS JOIN (
  VALUES
    ('1350', 'Supplier Advances', 'asset', 'debit', 'supplier_advance', 'advance', 'supplier_advance'),
    ('1360', 'Staff Advances', 'asset', 'debit', 'staff_advance', 'advance', 'staff_advance'),
    ('2410', 'Customer Advances', 'liability', 'credit', 'customer_advance', 'advance', 'customer_advance')
) AS v(code, name, type, normal_side, subtype, purpose, control_role)
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.tenant_id AND a.code = v.code
);

CREATE OR REPLACE FUNCTION bookone_classify_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.subtype IS NULL OR btrim(NEW.subtype) = '' THEN
    IF NEW.code ~ '^10[0-9]{2}$' THEN NEW.subtype := 'cash';
    ELSIF NEW.code ~ '^11[0-9]{2}$' THEN NEW.subtype := 'bank';
    ELSIF NEW.code ~ '^12[0-9]{2}$' THEN NEW.subtype := 'card_clearing';
    ELSIF NEW.type = 'expense' THEN NEW.subtype := 'operating_expense';
    ELSIF NEW.type = 'revenue' THEN NEW.subtype := 'other_income';
    ELSIF NEW.type = 'equity' THEN NEW.subtype := 'equity';
    ELSIF NEW.type = 'liability' THEN NEW.subtype := 'other_liability';
    ELSE NEW.subtype := 'other_asset';
    END IF;
  END IF;
  IF NEW.liquidity IS NULL OR btrim(NEW.liquidity) = '' THEN
    IF NEW.code ~ '^10[0-9]{2}$' THEN NEW.liquidity := 'cash';
    ELSIF NEW.code ~ '^11[0-9]{2}$' THEN NEW.liquidity := 'bank';
    ELSIF NEW.code ~ '^12[0-9]{2}$' THEN NEW.liquidity := 'card_clearing';
    ELSE NEW.liquidity := 'none';
    END IF;
  END IF;
  IF NEW.cash_flow_class IS NULL OR btrim(NEW.cash_flow_class) = '' THEN
    NEW.cash_flow_class := 'operating';
  END IF;
  IF NEW.control_role IS NULL OR btrim(NEW.control_role) = '' THEN
    NEW.control_role := 'none';
  END IF;
  IF NEW.purpose IS NULL OR btrim(NEW.purpose) = '' THEN
    NEW.purpose := 'general';
  END IF;
  IF NEW.reconcilable IS NULL OR btrim(NEW.reconcilable) = '' THEN
    NEW.reconcilable := CASE WHEN NEW.liquidity IN ('cash', 'bank', 'card_clearing') THEN '1' ELSE '0' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_classify_bi ON accounts;
CREATE TRIGGER accounts_classify_bi
BEFORE INSERT OR UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION bookone_classify_account();

CREATE OR REPLACE FUNCTION bookone_reject_group_posting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  grp varchar(1);
BEGIN
  SELECT is_group INTO grp FROM accounts WHERE id = NEW.account_id;
  IF grp = '1' THEN
    RAISE EXCEPTION 'Cannot post to a group account';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_lines_reject_group ON journal_lines;
CREATE TRIGGER journal_lines_reject_group
BEFORE INSERT OR UPDATE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION bookone_reject_group_posting();

CREATE TABLE IF NOT EXISTS party_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  party_id uuid NOT NULL REFERENCES parties(id),
  kind varchar(20) NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id),
  cash_account_id uuid NOT NULL REFERENCES accounts(id),
  status varchar(20) NOT NULL DEFAULT 'open',
  issued_amount numeric(18,2) NOT NULL,
  applied_amount numeric(18,2) NOT NULL DEFAULT 0,
  refunded_amount numeric(18,2) NOT NULL DEFAULT 0,
  expense_settled_amount numeric(18,2) NOT NULL DEFAULT 0,
  returned_cash_amount numeric(18,2) NOT NULL DEFAULT 0,
  source_transaction_id uuid REFERENCES transactions(id),
  source_journal_id uuid REFERENCES journal_entries(id),
  issued_on varchar(10) NOT NULL,
  notes text,
  idempotency_key varchar(80) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  CONSTRAINT party_advances_kind_chk CHECK (kind IN ('customer', 'supplier', 'staff')),
  CONSTRAINT party_advances_status_chk CHECK (status IN ('open', 'closed', 'voided')),
  CONSTRAINT party_advances_idem_uq UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS party_advances_tenant_party_idx ON party_advances (tenant_id, party_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS party_advance_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  advance_id uuid NOT NULL REFERENCES party_advances(id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL,
  amount numeric(18,2) NOT NULL,
  document_id uuid REFERENCES business_documents(id),
  transaction_id uuid REFERENCES transactions(id),
  journal_id uuid REFERENCES journal_entries(id),
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  CONSTRAINT party_advance_allocations_kind_chk CHECK (kind IN ('apply', 'refund', 'expense_settle', 'return_cash'))
);
CREATE INDEX IF NOT EXISTS party_advance_allocations_advance_idx ON party_advance_allocations (tenant_id, advance_id, created_at);

CREATE TABLE IF NOT EXISTS opening_balance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  effective_date varchar(10) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'preview',
  fingerprint varchar(2000) NOT NULL,
  debit_total numeric(18,2) NOT NULL DEFAULT 0,
  credit_total numeric(18,2) NOT NULL DEFAULT 0,
  source_transaction_id uuid REFERENCES transactions(id),
  source_journal_id uuid REFERENCES journal_entries(id),
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  CONSTRAINT opening_balance_runs_status_chk CHECK (status IN ('preview', 'posted', 'voided'))
);
CREATE UNIQUE INDEX IF NOT EXISTS opening_balance_runs_posted_fingerprint_uidx
  ON opening_balance_runs (tenant_id, fingerprint)
  WHERE status = 'posted' AND voided_at IS NULL;

CREATE TABLE IF NOT EXISTS opening_balance_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES opening_balance_runs(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0
);

ALTER TABLE party_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_advance_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balance_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_balance_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS party_advances_isolation ON party_advances;
CREATE POLICY party_advances_isolation ON party_advances
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS party_advance_allocations_isolation ON party_advance_allocations;
CREATE POLICY party_advance_allocations_isolation ON party_advance_allocations
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS opening_balance_runs_isolation ON opening_balance_runs;
CREATE POLICY opening_balance_runs_isolation ON opening_balance_runs
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS opening_balance_lines_isolation ON opening_balance_lines;
CREATE POLICY opening_balance_lines_isolation ON opening_balance_lines
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
