-- Commerce WP2: price lists per channel and customer group, with compare-at,
-- scheduled sale prices and quantity tiers. Additive and idempotent.

CREATE TABLE IF NOT EXISTS price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  currency varchar(5) NOT NULL DEFAULT 'LKR',
  customer_group varchar(40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE INDEX IF NOT EXISTS price_lists_tenant_idx ON price_lists (tenant_id) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  price_list_id uuid NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  price varchar(32),
  compare_at_price varchar(32),
  sale_price varchar(32),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS price_list_items_list_product_uq ON price_list_items (price_list_id, product_id);
CREATE INDEX IF NOT EXISTS price_list_items_sale_idx ON price_list_items (tenant_id, price_list_id, sale_starts_at, sale_ends_at);

ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['price_lists', 'price_list_items']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_isolation') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.current_tenant_id'', true))',
        t || '_isolation',
        t
      );
    END IF;
  END LOOP;
END $$;
