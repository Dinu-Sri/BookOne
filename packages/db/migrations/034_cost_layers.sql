-- FIFO cost layers (cartons). Additive. Existing qty is seeded on first use / when switching to FIFO.

CREATE TABLE IF NOT EXISTS inventory_cost_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id),
  qty_received numeric(18, 4) NOT NULL,
  qty_remaining numeric(18, 4) NOT NULL,
  unit_cost numeric(18, 2) NOT NULL DEFAULT 0,
  received_on varchar(10) NOT NULL,
  source_type varchar(40),
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE INDEX IF NOT EXISTS inventory_cost_layers_fifo_idx
  ON inventory_cost_layers (tenant_id, product_id, location_id, received_on, created_at)
  WHERE voided_at IS NULL AND qty_remaining > 0;

CREATE TABLE IF NOT EXISTS inventory_cost_layer_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  layer_id uuid NOT NULL REFERENCES inventory_cost_layers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  qty numeric(18, 4) NOT NULL,
  unit_cost numeric(18, 2) NOT NULL DEFAULT 0,
  source_type varchar(40),
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_cost_layer_consumptions_src_idx
  ON inventory_cost_layer_consumptions (tenant_id, source_type, source_id);

ALTER TABLE inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_cost_layer_consumptions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_cost_layers', 'inventory_cost_layer_consumptions']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.current_tenant_id'', true))',
        t || '_isolation',
        t
      );
    END IF;
  END LOOP;
END $$;
