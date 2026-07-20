-- Platform SaaS console: tenant status/modules + platform audit trail

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active';

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS modules jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenants.status IS 'active | suspended';
COMMENT ON COLUMN tenants.modules IS 'Feature flags: sales, purchase, inventory, pos, hr (accounting+company always on)';

CREATE TABLE IF NOT EXISTS platform_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  target_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  action varchar(80) NOT NULL,
  summary varchar(500),
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_audit_events_created_idx
  ON platform_audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_events_tenant_idx
  ON platform_audit_events (target_tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants (status);
CREATE INDEX IF NOT EXISTS tenants_plan_idx ON tenants (plan);
