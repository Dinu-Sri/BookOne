-- BookOne v2 - make the current owner account a super admin.
-- Additive/data-only migration. Required for Control Room visibility.

DO $$
DECLARE
  admin_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO admin_tenant_id
  FROM users
  WHERE email = 'dinu.sri.m@gmail.com'
    AND voided_at IS NULL
  LIMIT 1;

  IF admin_tenant_id IS NOT NULL THEN
    PERFORM set_config('app.current_tenant_id', admin_tenant_id::text, true);

    UPDATE users
    SET role = 'super_admin',
        updated_at = NOW()
    WHERE email = 'dinu.sri.m@gmail.com'
      AND voided_at IS NULL;
  END IF;
END $$;
