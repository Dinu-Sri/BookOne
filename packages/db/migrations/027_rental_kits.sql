-- Hire kits: a rental SKU that explodes into component fleet lines.

CREATE TABLE IF NOT EXISTS rental_kit_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kit_product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES inventory_products(id),
  qty numeric(18, 4) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_kit_components_uq UNIQUE (tenant_id, kit_product_id, component_product_id),
  CONSTRAINT rental_kit_components_not_self CHECK (kit_product_id <> component_product_id)
);

CREATE INDEX IF NOT EXISTS rental_kit_components_kit_idx
  ON rental_kit_components (tenant_id, kit_product_id);

ALTER TABLE rental_kit_components ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rental_kit_components'
      AND policyname = 'rental_kit_components_isolation'
  ) THEN
    CREATE POLICY rental_kit_components_isolation ON rental_kit_components
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
