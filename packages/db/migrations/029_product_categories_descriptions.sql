-- Product categories master + long description (WordPress-ready HTML).
-- Additive. Keeps inventory_products.category as the display name used by POS.

ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS long_description text;

CREATE TABLE IF NOT EXISTS inventory_product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  slug varchar(80),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_product_categories_name_uidx
  ON inventory_product_categories (tenant_id, lower(name))
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS inventory_product_categories_tenant_idx
  ON inventory_product_categories (tenant_id)
  WHERE voided_at IS NULL;

ALTER TABLE inventory_product_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inventory_product_categories'
      AND policyname = 'inventory_product_categories_isolation'
  ) THEN
    CREATE POLICY inventory_product_categories_isolation ON inventory_product_categories
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;

INSERT INTO inventory_product_categories (tenant_id, name)
SELECT DISTINCT p.tenant_id, btrim(p.category)
FROM inventory_products p
WHERE p.voided_at IS NULL
  AND p.category IS NOT NULL
  AND btrim(p.category) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_product_categories c
    WHERE c.tenant_id = p.tenant_id
      AND lower(c.name) = lower(btrim(p.category))
      AND c.voided_at IS NULL
  );
