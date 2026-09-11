-- Phase 2: per-person brand/location scope. Empty = all shops.
-- Additive. Owner/Admin ignore scope in the resolver.

CREATE TABLE IF NOT EXISTS tenant_membership_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
  scope_type varchar(20) NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_membership_scopes_uidx
  ON tenant_membership_scopes (membership_id, scope_type, target_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS tenant_membership_scopes_tenant_idx
  ON tenant_membership_scopes (tenant_id) WHERE voided_at IS NULL;

ALTER TABLE tenant_membership_scopes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_membership_scopes' AND policyname = 'tenant_membership_scopes_isolation'
  ) THEN
    CREATE POLICY tenant_membership_scopes_isolation ON tenant_membership_scopes
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
