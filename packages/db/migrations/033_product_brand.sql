-- Product catalog brand (company brand). Stock location stays on inventory_stock_levels.
-- Additive. Existing products keep brand_id NULL (all brands) and unassigned stock.

ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id);
CREATE INDEX IF NOT EXISTS inventory_products_brand_idx
  ON inventory_products (tenant_id, brand_id) WHERE voided_at IS NULL;
