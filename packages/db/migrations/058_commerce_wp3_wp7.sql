-- Commerce WP3-WP7: stock reservations, webhooks, channel customers and the
-- API call log. Additive and idempotent (runs on every boot).

-- WP3: a reservation holds stock through the same commitment table as web
-- orders (so the POS respects it). Reservation rows have no order and expire.
ALTER TABLE commerce_stock_commitments ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE commerce_stock_commitments ADD COLUMN IF NOT EXISTS reservation_id uuid;
ALTER TABLE commerce_stock_commitments ADD COLUMN IF NOT EXISTS expires_at timestamptz;
CREATE INDEX IF NOT EXISTS commerce_stock_commitments_reservation_idx
  ON commerce_stock_commitments (tenant_id, reservation_id) WHERE reservation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS commerce_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  external_id varchar(120) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  location_id uuid,
  partial varchar(1) NOT NULL DEFAULT '0',
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_reservations_conn_idx ON commerce_reservations (tenant_id, connection_id, external_id);
CREATE INDEX IF NOT EXISTS commerce_reservations_active_idx ON commerce_reservations (tenant_id, status, expires_at);

-- WP4: webhooks. Secrets are stored encrypted (AES-256-GCM with the app secret).
CREATE TABLE IF NOT EXISTS commerce_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  url varchar(500) NOT NULL,
  kinds jsonb NOT NULL DEFAULT '[]'::jsonb,
  secret_enc text NOT NULL,
  previous_secret_enc text,
  previous_expires_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'active',
  last_revision bigint NOT NULL DEFAULT 0,
  failing_since timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE INDEX IF NOT EXISTS commerce_webhooks_conn_idx ON commerce_webhooks (tenant_id, connection_id) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS commerce_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL REFERENCES commerce_webhooks(id) ON DELETE CASCADE,
  item_id varchar(80) NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  kind varchar(40) NOT NULL,
  body text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  last_status_code integer,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_webhook_deliveries_due_idx ON commerce_webhook_deliveries (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS commerce_webhook_deliveries_hook_idx ON commerce_webhook_deliveries (tenant_id, webhook_id, created_at DESC);

-- WP6: website customers linked to BookOne parties.
CREATE TABLE IF NOT EXISTS commerce_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  channel_customer_id varchar(120) NOT NULL,
  party_id uuid,
  name varchar(200) NOT NULL,
  email varchar(200),
  phone varchar(60),
  addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  marketing_opt_in varchar(1) NOT NULL DEFAULT '0',
  customer_group varchar(40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_customers_channel_uq ON commerce_customers (connection_id, channel_customer_id);

-- WP7: API call log per connection (kept 30 days).
CREATE TABLE IF NOT EXISTS commerce_api_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES commerce_connections(id) ON DELETE CASCADE,
  key_prefix varchar(20),
  method varchar(10) NOT NULL,
  path varchar(300) NOT NULL,
  status integer NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  request_id varchar(60),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_api_calls_conn_idx ON commerce_api_calls (tenant_id, connection_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['commerce_reservations', 'commerce_webhooks', 'commerce_webhook_deliveries', 'commerce_customers', 'commerce_api_calls']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_isolation') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.current_tenant_id'', true))',
        t || '_isolation',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Webhook dispatcher: which companies have webhook work (new feed items or due
-- retries) or expired reservations. Returns tenant ids only; the dispatcher then
-- works inside each tenant's RLS context.
CREATE OR REPLACE FUNCTION bookone_commerce_background_tenants()
RETURNS TABLE (tenant_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT w.tenant_id
  FROM public.commerce_webhooks w
  WHERE w.voided_at IS NULL
    AND w.status <> 'disabled'
    AND EXISTS (
      SELECT 1 FROM public.commerce_outbox o
      WHERE o.tenant_id = w.tenant_id AND o.connection_id = w.connection_id AND o.revision > w.last_revision
    )
  UNION
  SELECT DISTINCT d.tenant_id
  FROM public.commerce_webhook_deliveries d
  WHERE d.status = 'pending' AND d.next_attempt_at <= now()
  UNION
  SELECT DISTINCT r.tenant_id
  FROM public.commerce_reservations r
  WHERE r.status = 'active' AND r.expires_at <= now();
END;
$$;
REVOKE ALL ON FUNCTION bookone_commerce_background_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bookone_commerce_background_tenants() TO PUBLIC;
