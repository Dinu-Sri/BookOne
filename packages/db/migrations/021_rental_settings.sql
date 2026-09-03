-- Rental / hire module: tenant settings, CoA, RLS

CREATE TABLE IF NOT EXISTS rental_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  allow_hire_per_event varchar(1) NOT NULL DEFAULT '1',
  allow_hire_per_day varchar(1) NOT NULL DEFAULT '1',
  allow_hire_per_hour varchar(1) NOT NULL DEFAULT '1',
  default_hire_unit varchar(20) NOT NULL DEFAULT 'event',
  allow_invoice_on_confirm varchar(1) NOT NULL DEFAULT '1',
  allow_invoice_on_dispatch varchar(1) NOT NULL DEFAULT '1',
  allow_invoice_after_return varchar(1) NOT NULL DEFAULT '1',
  allow_invoice_manual varchar(1) NOT NULL DEFAULT '1',
  default_invoice_timing varchar(20) NOT NULL DEFAULT 'on_confirm',
  allow_invoice_timing_override varchar(1) NOT NULL DEFAULT '1',
  allow_deposit_per_event varchar(1) NOT NULL DEFAULT '1',
  allow_deposit_per_item varchar(1) NOT NULL DEFAULT '1',
  default_deposit_mode varchar(20) NOT NULL DEFAULT 'per_event',
  default_event_deposit_amount numeric(18, 2) NOT NULL DEFAULT 0,
  default_event_deposit_percent numeric(8, 2) NOT NULL DEFAULT 0,
  overlap_policy varchar(20) NOT NULL DEFAULT 'override',
  default_turnaround_hours integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_settings_tenant_uq UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS rental_settings_tenant_idx ON rental_settings (tenant_id);

ALTER TABLE rental_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rental_settings'
      AND policyname = 'rental_settings_isolation'
  ) THEN
    CREATE POLICY rental_settings_isolation ON rental_settings
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;

-- Rental CoA for existing tenants (idempotent)
INSERT INTO accounts (id, tenant_id, code, name, type, normal_side, created_at, updated_at)
SELECT gen_random_uuid(), t.id, '2400', 'Customer deposits', 'liability', 'credit', now(), now()
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a
  WHERE a.tenant_id = t.id AND a.code = '2400' AND a.voided_at IS NULL
);

INSERT INTO accounts (id, tenant_id, code, name, type, normal_side, created_at, updated_at)
SELECT gen_random_uuid(), t.id, '4400', 'Rental income', 'revenue', 'credit', now(), now()
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a
  WHERE a.tenant_id = t.id AND a.code = '4400' AND a.voided_at IS NULL
);

INSERT INTO accounts (id, tenant_id, code, name, type, normal_side, created_at, updated_at)
SELECT gen_random_uuid(), t.id, '4450', 'Damage and hire charges', 'revenue', 'credit', now(), now()
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a
  WHERE a.tenant_id = t.id AND a.code = '4450' AND a.voided_at IS NULL
);

INSERT INTO accounts (id, tenant_id, code, name, type, normal_side, created_at, updated_at)
SELECT gen_random_uuid(), t.id, '5150', 'Rental fleet write-off', 'expense', 'debit', now(), now()
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a
  WHERE a.tenant_id = t.id AND a.code = '5150' AND a.voided_at IS NULL
);

COMMENT ON COLUMN tenants.modules IS 'Feature flags: sales, purchase, inventory, pos, rental, hr (accounting+company always on)';
