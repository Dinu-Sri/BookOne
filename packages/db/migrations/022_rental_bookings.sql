-- Rental fleet product fields, virtual locations, event bookings, RLS

ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS hire_unit varchar(20);
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS turnaround_hours varchar(10);
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(18, 2);
ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS replacement_price numeric(18, 2);

CREATE TABLE IF NOT EXISTS rental_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES business_documents(id) ON DELETE CASCADE,
  event_date varchar(10),
  hire_from varchar(10) NOT NULL,
  hire_to varchar(10) NOT NULL,
  venue varchar(255),
  guest_count integer,
  deliver_at varchar(10),
  collect_at varchar(10),
  packing_notes text,
  overlap_override_reason varchar(500),
  overlap_overridden_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  CONSTRAINT rental_events_document_uidx UNIQUE (tenant_id, document_id)
);

CREATE INDEX IF NOT EXISTS rental_events_tenant_dates_idx
  ON rental_events (tenant_id, hire_from, hire_to);

CREATE TABLE IF NOT EXISTS rental_booking_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES business_documents(id) ON DELETE CASCADE,
  document_line_id uuid REFERENCES business_document_lines(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES inventory_products(id),
  location_id uuid REFERENCES locations(id),
  qty numeric(18, 4) NOT NULL,
  hire_from varchar(10) NOT NULL,
  hire_to varchar(10) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'reserved',
  dispatched_qty numeric(18, 4) NOT NULL DEFAULT 0,
  returned_qty numeric(18, 4) NOT NULL DEFAULT 0,
  damaged_qty numeric(18, 4) NOT NULL DEFAULT 0,
  missing_qty numeric(18, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);

CREATE INDEX IF NOT EXISTS rental_booking_lines_product_dates_idx
  ON rental_booking_lines (tenant_id, product_id, hire_from, hire_to)
  WHERE voided_at IS NULL;

ALTER TABLE rental_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_booking_lines ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rental_events' AND policyname = 'rental_events_isolation'
  ) THEN
    CREATE POLICY rental_events_isolation ON rental_events
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rental_booking_lines' AND policyname = 'rental_booking_lines_isolation'
  ) THEN
    CREATE POLICY rental_booking_lines_isolation ON rental_booking_lines
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;

-- Virtual fleet locations per tenant (idempotent by code)
INSERT INTO locations (id, tenant_id, name, code, location_type, status, created_at, updated_at)
SELECT gen_random_uuid(), t.id, 'On rent', 'ONRENT', 'on_rent', 'active', now(), now()
FROM tenants t
WHERE t.voided_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM locations l
    WHERE l.tenant_id = t.id AND l.code = 'ONRENT' AND l.voided_at IS NULL
  );

INSERT INTO locations (id, tenant_id, name, code, location_type, status, created_at, updated_at)
SELECT gen_random_uuid(), t.id, 'Repair', 'REPAIR', 'repair', 'active', now(), now()
FROM tenants t
WHERE t.voided_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM locations l
    WHERE l.tenant_id = t.id AND l.code = 'REPAIR' AND l.voided_at IS NULL
  );

INSERT INTO locations (id, tenant_id, name, code, location_type, status, created_at, updated_at)
SELECT gen_random_uuid(), t.id, 'Wash / turnaround', 'WASH', 'wash', 'active', now(), now()
FROM tenants t
WHERE t.voided_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM locations l
    WHERE l.tenant_id = t.id AND l.code = 'WASH' AND l.voided_at IS NULL
  );
