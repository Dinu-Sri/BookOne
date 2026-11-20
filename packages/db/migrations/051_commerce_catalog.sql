-- BookOne Commerce mapping proposals and BookOne-first publish claims.
-- Additive. Rollback: DROP the two tables. Existing commerce_* tables stay.

CREATE TABLE IF NOT EXISTS commerce_mapping_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  origin varchar(20) NOT NULL DEFAULT 'agent',
  status varchar(20) NOT NULL DEFAULT 'proposed',
  expected_revision integer NOT NULL DEFAULT 1,
  items_json jsonb NOT NULL,
  receipt_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_mapping_proposals_conn_idx
  ON commerce_mapping_proposals (tenant_id, connection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commerce_publish_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  bookone_product_id uuid NOT NULL REFERENCES inventory_products(id),
  sku varchar(80) NOT NULL,
  claim_key varchar(120) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'claimed',
  external_product_id varchar(80) NOT NULL DEFAULT '',
  external_variant_id varchar(80) NOT NULL DEFAULT '',
  issue text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_publish_claims_key_uq UNIQUE (tenant_id, connection_id, claim_key),
  CONSTRAINT commerce_publish_claims_product_uq UNIQUE (tenant_id, connection_id, bookone_product_id)
);
CREATE INDEX IF NOT EXISTS commerce_publish_claims_conn_idx
  ON commerce_publish_claims (tenant_id, connection_id, status);

ALTER TABLE commerce_mapping_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_publish_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY commerce_mapping_proposals_isolation ON commerce_mapping_proposals
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
CREATE POLICY commerce_publish_claims_isolation ON commerce_publish_claims
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
