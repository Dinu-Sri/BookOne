-- BookOne v2 - Sales tax invoice, multi-order links, sales settings, VAT sequence

-- Sales settings (per tenant)
CREATE TABLE IF NOT EXISTS sales_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  vat_rate_percent numeric(8, 2) NOT NULL DEFAULT 18,
  export_vat_rate_percent numeric(8, 2) NOT NULL DEFAULT 0,
  vat_registered varchar(1) NOT NULL DEFAULT '0',
  tax_invoice_dept_code varchar(40) NOT NULL DEFAULT '01',
  tax_invoice_serial_reset varchar(20) NOT NULL DEFAULT 'monthly',
  default_sale_channel varchar(20) NOT NULL DEFAULT 'local',
  default_invoice_kind varchar(20) NOT NULL DEFAULT 'commercial',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- Tax invoice serial counters: YYMMM_DEPT_SERIAL (monthly)
CREATE TABLE IF NOT EXISTS tax_invoice_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  year_yy varchar(2) NOT NULL,
  month_mmm varchar(3) NOT NULL,
  dept_code varchar(40) NOT NULL,
  last_serial integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, year_yy, month_mmm, dept_code)
);

-- Multi sales-order → one invoice
CREATE TABLE IF NOT EXISTS sales_invoice_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  invoice_id uuid NOT NULL REFERENCES business_documents(id),
  sales_order_id uuid NOT NULL REFERENCES business_documents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, sales_order_id)
);

-- Invoice / document SL fields
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS sale_channel varchar(20) NOT NULL DEFAULT 'local';
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS invoice_kind varchar(20) NOT NULL DEFAULT 'commercial';
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS delivery_date varchar(10);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS place_of_supply varchar(255);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS payment_mode varchar(40);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS tax_invoice_number varchar(80);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS export_country varchar(100);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS export_ref varchar(120);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS additional_info text;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS vat_rate numeric(8, 2) NOT NULL DEFAULT 0;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS amount_in_words text;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS purchaser_tin varchar(50);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS purchaser_phone varchar(40);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS purchaser_address varchar(500);

ALTER TABLE business_document_lines ADD COLUMN IF NOT EXISTS line_ref varchar(80);

-- Output VAT liability account for tax invoices (seed per tenant if missing)
INSERT INTO accounts (id, tenant_id, code, name, type, normal_side, created_at, updated_at)
SELECT gen_random_uuid(), t.id, '2200', 'Output VAT', 'liability', 'credit', now(), now()
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = '2200' AND a.voided_at IS NULL
);

ALTER TABLE sales_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_sources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sales_settings_isolation') THEN
    CREATE POLICY sales_settings_isolation ON sales_settings FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tax_invoice_sequences_isolation') THEN
    CREATE POLICY tax_invoice_sequences_isolation ON tax_invoice_sequences FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sales_invoice_sources_isolation') THEN
    CREATE POLICY sales_invoice_sources_isolation ON sales_invoice_sources FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
