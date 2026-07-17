-- BookOne v2 - POS multi-register, shifts, document links

CREATE TABLE IF NOT EXISTS pos_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code varchar(40) NOT NULL,
  name varchar(120) NOT NULL,
  location_id uuid REFERENCES locations(id),
  print_mode varchar(20) NOT NULL DEFAULT 'browser', -- browser | thermal | both
  thermal_device_hint varchar(255),
  receipt_footer text,
  default_payment_account_code varchar(20) NOT NULL DEFAULT '1000',
  is_active varchar(1) NOT NULL DEFAULT '1',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS pos_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  register_id uuid NOT NULL REFERENCES pos_registers(id),
  opened_by uuid NOT NULL REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  status varchar(20) NOT NULL DEFAULT 'open', -- open | closed
  opening_float numeric(18, 2) NOT NULL DEFAULT 0,
  closing_cash_count numeric(18, 2),
  expected_cash numeric(18, 2),
  variance_cash numeric(18, 2),
  notes text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_shifts_register_status_idx
  ON pos_shifts (tenant_id, register_id, status);

ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS register_id uuid REFERENCES pos_registers(id);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES pos_shifts(id);
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS pos_mode varchar(20); -- sale | return
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS source_pos_sale_id uuid REFERENCES business_documents(id);

-- Seed one default register per tenant if none
INSERT INTO pos_registers (id, tenant_id, code, name, print_mode, is_active, sort_order)
SELECT gen_random_uuid(), t.id, 'REG-01', 'Main counter', 'browser', '1', 0
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM pos_registers r WHERE r.tenant_id = t.id AND r.voided_at IS NULL
);

ALTER TABLE pos_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shifts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_registers_isolation') THEN
    CREATE POLICY pos_registers_isolation ON pos_registers FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pos_shifts_isolation') THEN
    CREATE POLICY pos_shifts_isolation ON pos_shifts FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
