-- BUG-0053: resolve a credential to tenant identity before app.current_tenant_id is set.
-- Narrow SECURITY DEFINER read of non-voided users by email. Does not GRANT BYPASSRLS
-- or SUPERUSER and does not pin a shared tenant GUC.

CREATE OR REPLACE FUNCTION bookone_lookup_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  email varchar,
  name varchar,
  tenant_id uuid,
  active_tenant_id uuid,
  role varchar,
  voided_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email, u.name, u.tenant_id, u.active_tenant_id, u.role, u.voided_at
  FROM users u
  WHERE lower(u.email) = lower(btrim(p_email))
    AND u.voided_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION bookone_lookup_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bookone_lookup_user_by_email(text) TO PUBLIC;
