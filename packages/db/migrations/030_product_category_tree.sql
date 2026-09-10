-- Hierarchical product categories (parent/child) plus optional brand + location
-- so later WordPress sync and inventory reports can use the same tree.

ALTER TABLE inventory_product_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES inventory_product_categories(id),
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id),
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);

ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES inventory_product_categories(id);

DROP INDEX IF EXISTS inventory_product_categories_name_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_product_categories_scope_uidx
  ON inventory_product_categories (
    tenant_id,
    lower(name),
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'),
    coalesce(brand_id, '00000000-0000-0000-0000-000000000000'),
    coalesce(location_id, '00000000-0000-0000-0000-000000000000')
  )
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS inventory_product_categories_parent_idx
  ON inventory_product_categories (tenant_id, parent_id)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS inventory_products_category_id_idx
  ON inventory_products (tenant_id, category_id)
  WHERE voided_at IS NULL AND category_id IS NOT NULL;

UPDATE inventory_products p
SET category_id = c.id
FROM inventory_product_categories c
WHERE p.category_id IS NULL
  AND p.voided_at IS NULL
  AND c.voided_at IS NULL
  AND p.tenant_id = c.tenant_id
  AND p.category IS NOT NULL
  AND lower(btrim(p.category)) = lower(c.name);
