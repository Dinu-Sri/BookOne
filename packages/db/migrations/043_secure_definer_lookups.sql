-- Forward hardening for privileged SECURITY DEFINER lookups (INV-20261016-042)
-- and a narrow platform tenant/user catalog (BUG-0055).
-- Does not GRANT BYPASSRLS or SUPERUSER and does not pin a shared tenant GUC.
-- Historical 042 is left unchanged; existing installs apply this file.

-- PostgreSQL 16: pg_temp is searched first for relations unless it is listed last.
-- Qualify objects and pin search_path so a caller TEMP table cannot shadow public.users.

CREATE OR REPLACE FUNCTION public.bookone_lookup_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  email varchar,
  name varchar,
  tenant_id uuid,
  active_tenant_id uuid,
  role varchar,
  voided_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.name,
    u.tenant_id,
    u.active_tenant_id,
    u.role,
    u.voided_at
  FROM public.users u
  WHERE lower(u.email) = lower(btrim(p_email))
    AND u.voided_at IS NULL
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookone_lookup_invite(p_token_hash text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email varchar,
  role_id uuid,
  status varchar,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.tenant_id,
    i.email,
    i.role_id,
    i.status,
    i.expires_at
  FROM public.tenant_invites i
  WHERE i.token_hash = p_token_hash
    AND i.voided_at IS NULL
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookone_platform_list_tenants()
RETURNS TABLE (
  id uuid,
  name varchar,
  slug varchar,
  plan varchar,
  environment varchar,
  status varchar,
  entity_kind varchar,
  capability_tier varchar,
  modules jsonb,
  created_at timestamptz,
  user_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.slug,
    t.plan,
    t.environment,
    t.status,
    t.entity_kind,
    t.capability_tier,
    t.modules,
    t.created_at,
    (
      SELECT count(*)::integer
      FROM public.tenant_memberships m
      WHERE m.tenant_id = t.id
        AND m.voided_at IS NULL
    ) AS user_count
  FROM public.tenants t
  ORDER BY t.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookone_platform_list_users()
RETURNS TABLE (
  id uuid,
  email varchar,
  name varchar,
  role varchar,
  tenant_id uuid,
  tenant_name varchar,
  tenant_slug varchar,
  entity_kind varchar,
  capability_tier varchar,
  tenant_status varchar,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.name,
    u.role,
    u.tenant_id,
    t.name,
    t.slug,
    t.entity_kind,
    t.capability_tier,
    t.status,
    u.created_at
  FROM public.users u
  INNER JOIN public.tenants t ON t.id = u.tenant_id
  WHERE u.voided_at IS NULL
  ORDER BY u.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.bookone_platform_slug_exists(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  found boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.slug = p_slug
  ) INTO found;
  RETURN COALESCE(found, false);
END;
$$;

DO $$
DECLARE
  owner_name name;
  fn text;
  r name;
  fns text[] := ARRAY[
    'bookone_lookup_user_by_email(text)',
    'bookone_lookup_invite(text)',
    'bookone_platform_list_tenants()',
    'bookone_platform_list_users()',
    'bookone_platform_slug_exists(text)'
  ];
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner)
    INTO owner_name
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'users'
    AND c.relkind = 'r';

  IF owner_name IS NULL THEN
    RAISE EXCEPTION 'public.users owner not found';
  END IF;

  FOREACH fn IN ARRAY fns
  LOOP
    IF to_regprocedure('public.' || fn) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION public.%s OWNER TO %I', fn, owner_name);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO %I', fn, owner_name);
    IF current_user IS DISTINCT FROM owner_name THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO %I', fn, current_user);
    END IF;
  END LOOP;

  FOR r IN
    SELECT DISTINCT a.grantee::name
    FROM information_schema.role_table_grants a
    WHERE a.table_schema = 'public'
      AND a.table_name IN ('users', 'tenants', 'tenant_memberships')
      AND a.grantee <> 'PUBLIC'
  LOOP
    FOREACH fn IN ARRAY fns
    LOOP
      IF to_regprocedure('public.' || fn) IS NULL THEN
        CONTINUE;
      END IF;
      BEGIN
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO %I', fn, r);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  -- Login identity resolution happens before tenant GUC exists. The connecting
  -- application role name is not fixed across owner-DB and restricted-DB
  -- fixtures, so EXECUTE on the single-row email lookup stays available after
  -- the search_path/object-resolution lock above.
  IF to_regprocedure('public.bookone_lookup_user_by_email(text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.bookone_lookup_user_by_email(text) TO PUBLIC;
  END IF;

  -- Platform catalog is also called by that same unknown app role after
  -- requirePlatformAdmin. EXECUTE is granted explicitly here; the function
  -- body is a fixed SELECT, not arbitrary SQL.
  IF to_regprocedure('public.bookone_platform_list_tenants()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.bookone_platform_list_tenants() TO PUBLIC;
  END IF;
  IF to_regprocedure('public.bookone_platform_list_users()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.bookone_platform_list_users() TO PUBLIC;
  END IF;
  IF to_regprocedure('public.bookone_platform_slug_exists(text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.bookone_platform_slug_exists(text) TO PUBLIC;
  END IF;
  IF to_regprocedure('public.bookone_lookup_invite(text)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.bookone_lookup_invite(text) TO PUBLIC;
  END IF;
END $$;
