-- BookOne v2 - Four modules foundation: Parties, Sales, Purchase, Inventory
-- Additive only. Enables quotes/orders without journals and inventory COGS testing.

-- ---------- Parties enrich ----------
ALTER TABLE parties ADD COLUMN IF NOT EXISTS code varchar(40);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS tax_id varchar(100);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS credit_limit numeric(18, 2);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS payment_terms_days integer;
ALTER TABLE parties ADD COLUMN IF NOT EXISTS notes text;

-- ---------- Commercial documents (Sales + Purchase) ----------
ALTER TABLE business_documents ALTER COLUMN transaction_id DROP NOT NULL;
ALTER TABLE business_documents ALTER COLUMN document_type TYPE varchar(30);

ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES business_documents(id);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS discount_id uuid;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS discount_total numeric(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS brand_id uuid;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS posted_at timestamptz;

-- Normalize legacy invoice type for dual-read compatibility (keep values; UI maps both)
-- customer_invoice remains valid; new writes use sales_invoice

ALTER TABLE business_document_lines ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE business_document_lines ALTER COLUMN quantity TYPE numeric(18, 4);
ALTER TABLE business_document_lines ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE business_document_lines ADD COLUMN IF NOT EXISTS unit_cost numeric(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE business_document_lines ADD COLUMN IF NOT EXISTS discount_percent numeric(8, 2) NOT NULL DEFAULT 0;
ALTER TABLE business_document_lines ADD COLUMN IF NOT EXISTS discount_amount numeric(18, 2) NOT NULL DEFAULT 0;

-- ---------- Sales discounts ----------
CREATE TABLE IF NOT EXISTS sales_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name varchar(255) NOT NULL,
  code varchar(40),
  discount_type varchar(20) NOT NULL DEFAULT 'percent',
  value numeric(18, 2) NOT NULL,
  is_active varchar(1) NOT NULL DEFAULT '1',
  starts_on varchar(10),
  ends_on varchar(10),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'business_documents_discount_id_fkey'
  ) THEN
    ALTER TABLE business_documents
      ADD CONSTRAINT business_documents_discount_id_fkey
      FOREIGN KEY (discount_id) REFERENCES sales_discounts(id);
  END IF;
END $$;

-- ---------- Inventory ----------
CREATE TABLE IF NOT EXISTS inventory_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  sku varchar(80) NOT NULL,
  name varchar(255) NOT NULL,
  description text,
  product_type varchar(20) NOT NULL DEFAULT 'stocked',
  unit varchar(40) NOT NULL DEFAULT 'ea',
  unit_cost numeric(18, 2) NOT NULL DEFAULT 0,
  sell_price numeric(18, 2) NOT NULL DEFAULT 0,
  revenue_account_code varchar(20) NOT NULL DEFAULT '4000',
  cogs_account_code varchar(20) NOT NULL DEFAULT '5000',
  inventory_account_code varchar(20) NOT NULL DEFAULT '5100',
  is_active varchar(1) NOT NULL DEFAULT '1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_products_tenant_sku_uidx
  ON inventory_products (tenant_id, sku)
  WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory_stock_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  product_id uuid NOT NULL REFERENCES inventory_products(id),
  location_id uuid REFERENCES locations(id),
  qty_on_hand numeric(18, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_stock_levels_product_location_uidx
  ON inventory_stock_levels (tenant_id, product_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS inventory_stock_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  doc_type varchar(20) NOT NULL,
  document_number varchar(50) NOT NULL,
  doc_date varchar(10) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'posted',
  from_location_id uuid REFERENCES locations(id),
  to_location_id uuid REFERENCES locations(id),
  reason varchar(255),
  notes text,
  transaction_id uuid REFERENCES transactions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);

CREATE TABLE IF NOT EXISTS inventory_stock_doc_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  stock_doc_id uuid NOT NULL REFERENCES inventory_stock_docs(id),
  product_id uuid NOT NULL REFERENCES inventory_products(id),
  quantity numeric(18, 4) NOT NULL,
  unit_cost numeric(18, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  movement_type varchar(20) NOT NULL,
  product_id uuid NOT NULL REFERENCES inventory_products(id),
  quantity numeric(18, 4) NOT NULL,
  unit_cost numeric(18, 2) NOT NULL DEFAULT 0,
  from_location_id uuid REFERENCES locations(id),
  to_location_id uuid REFERENCES locations(id),
  reference_type varchar(40),
  reference_id uuid,
  transaction_id uuid REFERENCES transactions(id),
  memo varchar(500),
  movement_date varchar(10) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'business_document_lines_product_id_fkey'
  ) THEN
    ALTER TABLE business_document_lines
      ADD CONSTRAINT business_document_lines_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES inventory_products(id);
  END IF;
END $$;

-- ---------- RLS ----------
ALTER TABLE sales_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock_doc_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sales_discounts_isolation') THEN
    CREATE POLICY sales_discounts_isolation ON sales_discounts
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inventory_products_isolation') THEN
    CREATE POLICY inventory_products_isolation ON inventory_products
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inventory_stock_levels_isolation') THEN
    CREATE POLICY inventory_stock_levels_isolation ON inventory_stock_levels
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inventory_stock_docs_isolation') THEN
    CREATE POLICY inventory_stock_docs_isolation ON inventory_stock_docs
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inventory_stock_doc_lines_isolation') THEN
    CREATE POLICY inventory_stock_doc_lines_isolation ON inventory_stock_doc_lines
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inventory_movements_isolation') THEN
    CREATE POLICY inventory_movements_isolation ON inventory_movements
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
