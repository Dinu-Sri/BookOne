-- Purchase P3: tenant purchase controls / settings

CREATE TABLE IF NOT EXISTS purchase_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  require_bill_approval varchar(1) NOT NULL DEFAULT '0',
  require_supplier_invoice_no varchar(1) NOT NULL DEFAULT '0',
  block_duplicate_bills varchar(1) NOT NULL DEFAULT '1',
  require_grn_before_bill varchar(1) NOT NULL DEFAULT '0',
  default_payment_terms varchar(40) NOT NULL DEFAULT 'Net 30',
  default_expense_account varchar(20) NOT NULL DEFAULT '6800',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_settings_tenant_uq UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS purchase_settings_tenant_idx ON purchase_settings (tenant_id);
