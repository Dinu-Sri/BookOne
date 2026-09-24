-- Platform ops timings (no tenant RLS — operators read via /ops/logs).
CREATE TABLE IF NOT EXISTS ops_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind varchar(20) NOT NULL DEFAULT 'slow',
  path varchar(500),
  duration_ms integer,
  status varchar(40),
  message text
);
CREATE INDEX IF NOT EXISTS ops_request_logs_created_idx ON ops_request_logs (created_at DESC);

-- Per-tenant action keys so Post / Receive payment can run only once.
CREATE TABLE IF NOT EXISTS ops_idempotency (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key varchar(80) NOT NULL,
  result_json text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS ops_idempotency_created_idx ON ops_idempotency (created_at DESC);

ALTER TABLE ops_idempotency ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ops_idempotency' AND policyname = 'ops_idempotency_isolation'
  ) THEN
    CREATE POLICY ops_idempotency_isolation ON ops_idempotency
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ops_idempotency RLS skipped: %', SQLERRM;
END $$;
