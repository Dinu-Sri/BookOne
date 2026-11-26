-- Commerce WP1: catalog data for websites (variants, brands, gallery images,
-- attributes, shipping weight) and per-channel publishing. Additive and
-- idempotent; existing products keep working unchanged.

CREATE TABLE IF NOT EXISTS inventory_product_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  slug varchar(120),
  description text,
  website_url varchar(300),
  logo_key varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE INDEX IF NOT EXISTS inventory_product_brands_tenant_idx ON inventory_product_brands (tenant_id) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory_product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  storage_key varchar(500) NOT NULL,
  content_type varchar(40) NOT NULL DEFAULT 'image/webp',
  width integer NOT NULL,
  height integer NOT NULL,
  alt varchar(255),
  position integer NOT NULL DEFAULT 0,
  checksum varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE INDEX IF NOT EXISTS inventory_product_images_product_idx ON inventory_product_images (tenant_id, product_id) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code varchar(60) NOT NULL,
  name varchar(120) NOT NULL,
  type varchar(20) NOT NULL DEFAULT 'text',
  unit varchar(20),
  allowed_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  filterable varchar(1) NOT NULL DEFAULT '0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_attributes_tenant_code_uq ON inventory_attributes (tenant_id, code) WHERE voided_at IS NULL;

ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS short_name varchar(120),
  ADD COLUMN IF NOT EXISTS product_brand_id uuid REFERENCES inventory_product_brands(id),
  ADD COLUMN IF NOT EXISTS parent_product_id uuid REFERENCES inventory_products(id),
  ADD COLUMN IF NOT EXISTS variant_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS product_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS swatch_hex varchar(9),
  ADD COLUMN IF NOT EXISTS variant_sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default_variant varchar(1) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_barcodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attribute_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS weight_grams integer,
  ADD COLUMN IF NOT EXISTS length_mm integer,
  ADD COLUMN IF NOT EXISTS width_mm integer,
  ADD COLUMN IF NOT EXISTS height_mm integer,
  ADD COLUMN IF NOT EXISTS fragile varchar(1) NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS min_order_qty numeric(18,4),
  ADD COLUMN IF NOT EXISTS max_order_qty numeric(18,4),
  ADD COLUMN IF NOT EXISTS order_qty_step numeric(18,4),
  ADD COLUMN IF NOT EXISTS allow_backorder varchar(1) NOT NULL DEFAULT '0';
CREATE INDEX IF NOT EXISTS inventory_products_parent_idx ON inventory_products (tenant_id, parent_product_id) WHERE parent_product_id IS NOT NULL;

ALTER TABLE inventory_product_categories
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_key varchar(500);

ALTER TABLE commerce_connections
  ADD COLUMN IF NOT EXISTS channel_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS commerce_channel_products (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, product_id)
);

ALTER TABLE inventory_product_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_channel_products ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_product_brands', 'inventory_product_images', 'inventory_attributes', 'commerce_channel_products']
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
