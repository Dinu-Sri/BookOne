-- Tenant RBAC: jobs, permissions, invites, active workspace.
-- Additive. Does not rewrite users.role. Sets rbac_enforced=true after Owner backfill.

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_tenant_id uuid REFERENCES tenants(id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rbac_enforced boolean NOT NULL DEFAULT false;
ALTER TABLE tenant_memberships ADD COLUMN IF NOT EXISTS primary_role_id uuid;

UPDATE users SET email = lower(btrim(email)) WHERE email IS DISTINCT FROM lower(btrim(email));
UPDATE users SET active_tenant_id = tenant_id WHERE active_tenant_id IS NULL AND tenant_id IS NOT NULL;

DO $$
DECLARE
  keeper uuid;
  dup uuid;
BEGIN
  FOR keeper IN
    SELECT MIN(id) FROM users WHERE voided_at IS NULL GROUP BY lower(email) HAVING count(*) > 1
  LOOP
    NULL;
  END LOOP;
  FOR keeper IN
    SELECT DISTINCT ON (lower(email)) id FROM users WHERE voided_at IS NULL ORDER BY lower(email), created_at ASC
  LOOP
    FOR dup IN
      SELECT u.id FROM users u
      WHERE u.voided_at IS NULL
        AND lower(u.email) = (SELECT lower(email) FROM users WHERE id = keeper)
        AND u.id <> keeper
    LOOP
      UPDATE tenant_memberships m
      SET user_id = keeper
      WHERE user_id = dup
        AND NOT EXISTS (
          SELECT 1 FROM tenant_memberships x
          WHERE x.tenant_id = m.tenant_id AND x.user_id = keeper AND x.voided_at IS NULL
        );
      UPDATE tenant_memberships SET voided_at = now(), status = 'disabled' WHERE user_id = dup AND voided_at IS NULL;
      UPDATE users SET voided_at = now() WHERE id = dup AND voided_at IS NULL;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_alive_uidx ON users (lower(email)) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_user_alive_uidx
  ON tenant_memberships (tenant_id, user_id) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS tenant_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  slug varchar(50) NOT NULL,
  template_key varchar(50),
  template_version varchar(10),
  is_locked varchar(1) NOT NULL DEFAULT '0',
  customized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_roles_slug_uidx ON tenant_roles (tenant_id, slug) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  permission_key varchar(80) NOT NULL,
  level varchar(10) NOT NULL DEFAULT 'read',
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_role_permissions_key_uidx
  ON tenant_role_permissions (role_id, permission_key) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS tenant_membership_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_membership_roles_one_extra_uidx
  ON tenant_membership_roles (tenant_id, membership_id) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS tenant_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key varchar(80) NOT NULL,
  effect varchar(10) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_permission_overrides_uidx
  ON tenant_permission_overrides (tenant_id, user_id, permission_key) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS tenant_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  role_id uuid NOT NULL REFERENCES tenant_roles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);

CREATE TABLE IF NOT EXISTS tenant_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES tenant_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);

CREATE TABLE IF NOT EXISTS tenant_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email varchar(320) NOT NULL,
  role_id uuid NOT NULL REFERENCES tenant_roles(id),
  invited_by uuid REFERENCES users(id),
  token_hash varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_invites_token_uidx ON tenant_invites (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_invites_pending_email_uidx
  ON tenant_invites (tenant_id, lower(email)) WHERE status = 'pending' AND voided_at IS NULL;

ALTER TABLE tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invites ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_roles',
    'tenant_role_permissions',
    'tenant_membership_roles',
    'tenant_permission_overrides',
    'tenant_teams',
    'tenant_team_members',
    'tenant_invites'
  ]
  LOOP
    policy_name := table_name || '_isolation';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.current_tenant_id'', true))',
        policy_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION bookone_lookup_invite(p_token_hash text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email varchar,
  role_id uuid,
  status varchar,
  expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.tenant_id, i.email, i.role_id, i.status, i.expires_at
  FROM tenant_invites i
  WHERE i.token_hash = p_token_hash
    AND i.voided_at IS NULL
  LIMIT 1;
$$;

-- Seed template jobs per tenant (Owner/Admin/…) — permission rows filled by app seedJobsForTenant on next boot/Team visit.
INSERT INTO tenant_roles (tenant_id, name, slug, template_key, template_version, is_locked)
SELECT t.id, x.name, x.slug, x.slug, '1', CASE WHEN x.slug IN ('owner') THEN '1' ELSE '0' END
FROM tenants t
CROSS JOIN (VALUES
  ('Owner','owner'),
  ('Admin','admin'),
  ('Accountant','accountant'),
  ('Sales','sales'),
  ('Purchasing','purchasing'),
  ('Warehouse','warehouse'),
  ('Cashier','cashier'),
  ('Viewer','viewer')
) AS x(name, slug)
WHERE t.voided_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM tenant_roles r WHERE r.tenant_id = t.id AND r.slug = x.slug AND r.voided_at IS NULL
  );

-- Memberships for users missing one on their home tenant
INSERT INTO tenant_memberships (tenant_id, user_id, role, status, primary_role_id)
SELECT u.tenant_id, u.id, 'owner', 'active', r.id
FROM users u
JOIN tenant_roles r ON r.tenant_id = u.tenant_id AND r.slug = 'owner' AND r.voided_at IS NULL
WHERE u.voided_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM tenant_memberships m
    WHERE m.user_id = u.id AND m.tenant_id = u.tenant_id AND m.voided_at IS NULL
  );

UPDATE tenant_memberships m
SET primary_role_id = r.id,
    role = COALESCE(NULLIF(m.role, ''), 'owner')
FROM tenant_roles r
WHERE m.primary_role_id IS NULL
  AND m.voided_at IS NULL
  AND r.tenant_id = m.tenant_id
  AND r.voided_at IS NULL
  AND r.slug = CASE
    WHEN lower(m.role) IN ('admin') THEN 'admin'
    WHEN lower(m.role) IN ('owner', 'super_admin') THEN 'owner'
    WHEN lower(m.role) IN ('accountant','sales','purchasing','warehouse','cashier','viewer') THEN lower(m.role)
    ELSE 'owner'
  END;

UPDATE tenant_memberships m
SET role = r.slug
FROM tenant_roles r
WHERE m.primary_role_id = r.id AND (m.role IS NULL OR m.role = '' OR m.role = 'member');

-- Flip enforcement after everyone has an Owner/job so solo companies keep full access.
UPDATE tenants SET rbac_enforced = true WHERE voided_at IS NULL;
