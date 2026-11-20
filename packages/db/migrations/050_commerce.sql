-- BookOne Commerce C1–C3. Additive. Default posting is preview/staging.
-- Rollback: DROP the commerce_* tables. Existing sales/inventory tables are unchanged.

CREATE TABLE IF NOT EXISTS commerce_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  name varchar(120) NOT NULL,
  kind varchar(40) NOT NULL,
  environment varchar(20) NOT NULL,
  location_id uuid REFERENCES locations(id),
  currency varchar(5) NOT NULL DEFAULT 'LKR',
  posting_mode varchar(20) NOT NULL DEFAULT 'preview',
  inbound_paused varchar(1) NOT NULL DEFAULT '0',
  outbound_paused varchar(1) NOT NULL DEFAULT '0',
  oversell_policy varchar(20) NOT NULL DEFAULT 'review',
  reservation_mode varchar(20) NOT NULL DEFAULT 'disabled',
  matching_policy varchar(40) NOT NULL DEFAULT 'sku',
  tax_mode varchar(40) NOT NULL DEFAULT 'domestic_inclusive',
  status varchar(20) NOT NULL DEFAULT 'active',
  last_catalog_sync_at timestamptz,
  last_stock_sync_at timestamptz,
  last_order_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz
);
CREATE INDEX IF NOT EXISTS commerce_connections_tenant_idx ON commerce_connections (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  prefix varchar(16) NOT NULL,
  secret_hash varchar(64) NOT NULL,
  scopes text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  last_used_at timestamptz,
  rotated_from_id uuid,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_credentials_prefix_uq UNIQUE (prefix)
);
CREATE INDEX IF NOT EXISTS commerce_credentials_connection_idx ON commerce_credentials (tenant_id, connection_id, status);

CREATE TABLE IF NOT EXISTS commerce_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  bookone_product_id uuid NOT NULL REFERENCES inventory_products(id),
  sku varchar(80) NOT NULL,
  external_product_id varchar(80) NOT NULL,
  external_variant_id varchar(80) NOT NULL DEFAULT '',
  status varchar(20) NOT NULL DEFAULT 'mapped',
  opted_in_fields text NOT NULL DEFAULT 'sku,name,unit',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_product_mappings_product_uq UNIQUE (tenant_id, connection_id, bookone_product_id),
  CONSTRAINT commerce_product_mappings_external_uq UNIQUE (tenant_id, connection_id, external_product_id, external_variant_id)
);
CREATE INDEX IF NOT EXISTS commerce_product_mappings_sku_idx ON commerce_product_mappings (tenant_id, connection_id, sku);

CREATE TABLE IF NOT EXISTS commerce_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  external_id varchar(80) NOT NULL,
  status varchar(40) NOT NULL,
  review_reason text,
  currency varchar(5) NOT NULL DEFAULT 'LKR',
  total varchar(32) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  snapshot_json jsonb NOT NULL,
  source_version varchar(80),
  source_timezone varchar(80),
  placed_at timestamptz NOT NULL,
  document_id uuid,
  document_number varchar(50),
  last_event_id uuid,
  last_applied_version varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_orders_external_uq UNIQUE (tenant_id, connection_id, external_id)
);
CREATE INDEX IF NOT EXISTS commerce_orders_status_idx ON commerce_orders (tenant_id, connection_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  external_line_id varchar(80) NOT NULL,
  sku varchar(80) NOT NULL,
  bookone_product_id uuid,
  quantity varchar(32) NOT NULL,
  unit_price varchar(32) NOT NULL,
  tax_amount varchar(32) NOT NULL DEFAULT '0',
  discount_amount varchar(32) NOT NULL DEFAULT '0',
  restocked_qty varchar(32) NOT NULL DEFAULT '0',
  refunded_amount varchar(32) NOT NULL DEFAULT '0',
  CONSTRAINT commerce_order_lines_external_uq UNIQUE (tenant_id, connection_id, external_line_id)
);

CREATE TABLE IF NOT EXISTS commerce_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  external_event_id varchar(80) NOT NULL,
  kind varchar(40) NOT NULL,
  status varchar(20) NOT NULL,
  source_version varchar(80),
  effective_at timestamptz NOT NULL,
  amount varchar(32),
  restock varchar(1) NOT NULL DEFAULT '0',
  payload_json jsonb NOT NULL,
  result_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_order_events_external_uq UNIQUE (tenant_id, connection_id, external_event_id)
);

CREATE TABLE IF NOT EXISTS commerce_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  external_refund_id varchar(80) NOT NULL,
  amount varchar(32) NOT NULL,
  restock varchar(1) NOT NULL DEFAULT '0',
  document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_refunds_external_uq UNIQUE (tenant_id, connection_id, external_refund_id)
);

CREATE TABLE IF NOT EXISTS commerce_idempotency (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  idempotency_key varchar(80) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  order_id uuid,
  receipt_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, connection_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS commerce_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  kind varchar(40) NOT NULL,
  product_id uuid,
  sku varchar(80),
  payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_outbox_revision_uq UNIQUE (tenant_id, connection_id, revision)
);
CREATE INDEX IF NOT EXISTS commerce_outbox_conn_idx ON commerce_outbox (tenant_id, connection_id, revision);

CREATE TABLE IF NOT EXISTS commerce_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  kind varchar(40) NOT NULL,
  cursor text,
  last_revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_checkpoints_kind_uq UNIQUE (tenant_id, connection_id, kind)
);

CREATE TABLE IF NOT EXISTS commerce_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES commerce_connections(id) ON DELETE CASCADE,
  actor_user_id uuid,
  action varchar(80) NOT NULL,
  entity varchar(80) NOT NULL,
  entity_id uuid,
  detail_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_activity_tenant_idx ON commerce_activity (tenant_id, created_at DESC);

ALTER TABLE commerce_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY commerce_connections_isolation ON commerce_connections
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_credentials_isolation ON commerce_credentials
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_product_mappings_isolation ON commerce_product_mappings
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_orders_isolation ON commerce_orders
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_order_lines_isolation ON commerce_order_lines
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_order_events_isolation ON commerce_order_events
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_refunds_isolation ON commerce_refunds
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_idempotency_isolation ON commerce_idempotency
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_outbox_isolation ON commerce_outbox
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_checkpoints_isolation ON commerce_checkpoints
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_activity_isolation ON commerce_activity
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Prefix lookup happens before tenant GUC is known. The function returns
-- verifier metadata only; the secret is never stored or returned.
CREATE OR REPLACE FUNCTION bookone_commerce_lookup_credential(p_prefix varchar)
RETURNS TABLE (
  tenant_id uuid,
  id uuid,
  connection_id uuid,
  created_by_user_id uuid,
  prefix varchar,
  secret_hash varchar,
  scopes text,
  status varchar,
  expires_at timestamptz,
  last_used_at timestamptz,
  rotated_from_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.tenant_id,
    c.id,
    c.connection_id,
    c.created_by_user_id,
    c.prefix,
    c.secret_hash,
    c.scopes,
    c.status,
    c.expires_at,
    c.last_used_at,
    c.rotated_from_id,
    c.created_at
  FROM public.commerce_credentials c
  WHERE c.prefix = p_prefix
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION bookone_commerce_lookup_credential(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bookone_commerce_lookup_credential(varchar) TO PUBLIC;
