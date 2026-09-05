-- High-value hire serials (tents, generators). Bulk SKUs stay qty-only.

ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS tracks_serials varchar(1) NOT NULL DEFAULT '0';

CREATE TABLE IF NOT EXISTS rental_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  serial_code varchar(80) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'available',
  booking_line_id uuid REFERENCES rental_booking_lines(id) ON DELETE SET NULL,
  notes varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_serials_code_uq UNIQUE (tenant_id, product_id, serial_code)
);

CREATE INDEX IF NOT EXISTS rental_serials_product_idx
  ON rental_serials (tenant_id, product_id, status);

ALTER TABLE rental_serials ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rental_serials'
      AND policyname = 'rental_serials_isolation'
  ) THEN
    CREATE POLICY rental_serials_isolation ON rental_serials
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
