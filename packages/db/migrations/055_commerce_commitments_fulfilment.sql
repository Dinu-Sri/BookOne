-- Commerce WP0: web orders hold stock on receipt (COD / bank transfer) and carry
-- staff fulfilment (confirm, dispatch with courier + tracking, delivered).
-- Additive and idempotent.

ALTER TABLE commerce_orders
  ADD COLUMN IF NOT EXISTS fulfilment jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS commerce_stock_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  location_id uuid,
  quantity varchar(32) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_stock_commitments_active_idx
  ON commerce_stock_commitments (tenant_id, product_id, location_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS commerce_stock_commitments_order_idx
  ON commerce_stock_commitments (tenant_id, order_id);

ALTER TABLE commerce_stock_commitments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commerce_stock_commitments' AND policyname = 'commerce_stock_commitments_isolation'
  ) THEN
    CREATE POLICY commerce_stock_commitments_isolation ON commerce_stock_commitments
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END
$$;
