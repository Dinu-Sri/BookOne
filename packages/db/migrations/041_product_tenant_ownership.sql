-- Document/stock rows may only reference a product that belongs to the same tenant.
CREATE OR REPLACE FUNCTION bookone_assert_product_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM inventory_products p
    WHERE p.id = NEW.product_id
      AND p.tenant_id = NEW.tenant_id
      AND p.voided_at IS NULL
  ) THEN
    RAISE EXCEPTION 'That product is not in this company.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_document_lines_product_tenant ON business_document_lines;
CREATE TRIGGER business_document_lines_product_tenant
  BEFORE INSERT OR UPDATE OF product_id, tenant_id
  ON business_document_lines
  FOR EACH ROW
  EXECUTE FUNCTION bookone_assert_product_tenant();

DROP TRIGGER IF EXISTS inventory_movements_product_tenant ON inventory_movements;
CREATE TRIGGER inventory_movements_product_tenant
  BEFORE INSERT OR UPDATE OF product_id, tenant_id
  ON inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION bookone_assert_product_tenant();

DROP TRIGGER IF EXISTS inventory_stock_levels_product_tenant ON inventory_stock_levels;
CREATE TRIGGER inventory_stock_levels_product_tenant
  BEFORE INSERT OR UPDATE OF product_id, tenant_id
  ON inventory_stock_levels
  FOR EACH ROW
  EXECUTE FUNCTION bookone_assert_product_tenant();

DROP TRIGGER IF EXISTS inventory_stock_doc_lines_product_tenant ON inventory_stock_doc_lines;
CREATE TRIGGER inventory_stock_doc_lines_product_tenant
  BEFORE INSERT OR UPDATE OF product_id, tenant_id
  ON inventory_stock_doc_lines
  FOR EACH ROW
  EXECUTE FUNCTION bookone_assert_product_tenant();

DROP TRIGGER IF EXISTS inventory_cost_layers_product_tenant ON inventory_cost_layers;
CREATE TRIGGER inventory_cost_layers_product_tenant
  BEFORE INSERT OR UPDATE OF product_id, tenant_id
  ON inventory_cost_layers
  FOR EACH ROW
  EXECUTE FUNCTION bookone_assert_product_tenant();

DROP TRIGGER IF EXISTS inventory_cost_layer_consumptions_product_tenant ON inventory_cost_layer_consumptions;
CREATE TRIGGER inventory_cost_layer_consumptions_product_tenant
  BEFORE INSERT OR UPDATE OF product_id, tenant_id
  ON inventory_cost_layer_consumptions
  FOR EACH ROW
  EXECUTE FUNCTION bookone_assert_product_tenant();
