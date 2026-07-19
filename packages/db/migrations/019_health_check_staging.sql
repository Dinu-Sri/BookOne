-- Staging environment flag + ERP health-check run history

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS environment varchar(20) NOT NULL DEFAULT 'production';

CREATE TABLE IF NOT EXISTS health_check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  status varchar(20) NOT NULL DEFAULT 'running',
  suite varchar(40) NOT NULL DEFAULT 'full',
  seed integer NOT NULL DEFAULT 0,
  steps_json text NOT NULL DEFAULT '[]',
  created_json text NOT NULL DEFAULT '{}',
  summary varchar(500),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_check_runs_tenant_idx
  ON health_check_runs (tenant_id, started_at DESC);
