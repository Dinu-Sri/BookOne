-- BookOne v2 - Product photos (storage key or public path)
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS image_key varchar(500);

CREATE INDEX IF NOT EXISTS inventory_products_image_key_idx
  ON inventory_products (tenant_id)
  WHERE image_key IS NOT NULL AND voided_at IS NULL;
