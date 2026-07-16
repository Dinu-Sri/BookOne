-- BookOne v2 - Inventory products v2 (physical / digital / service)
-- Additive migration. Legacy product_type 'stocked' → 'physical'.

ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS category varchar(120);
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS barcode varchar(80);
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS sellable varchar(1) NOT NULL DEFAULT '1';
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS purchasable varchar(1) NOT NULL DEFAULT '1';
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS tax_status varchar(20) NOT NULL DEFAULT 'unknown';
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS reorder_level numeric(18, 4);
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS reorder_qty numeric(18, 4);
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS preferred_vendor_id uuid REFERENCES parties(id);
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS expense_account_code varchar(20) NOT NULL DEFAULT '6800';
ALTER TABLE inventory_products ADD COLUMN IF NOT EXISTS notes text;

UPDATE inventory_products
SET product_type = 'physical'
WHERE product_type = 'stocked';

CREATE INDEX IF NOT EXISTS inventory_products_tenant_type_idx
  ON inventory_products (tenant_id, product_type)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS inventory_products_tenant_sku_lower_idx
  ON inventory_products (tenant_id, lower(sku))
  WHERE voided_at IS NULL;
