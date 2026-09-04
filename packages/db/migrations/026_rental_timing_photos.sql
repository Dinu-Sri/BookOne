-- Hire invoice timing on the event + return inspection photos.

ALTER TABLE rental_events
  ADD COLUMN IF NOT EXISTS invoice_timing varchar(20) NOT NULL DEFAULT 'on_confirm';

COMMENT ON COLUMN rental_events.invoice_timing IS
  'on_confirm | on_dispatch | after_return | manual — when the hire invoice may be posted.';

CREATE TABLE IF NOT EXISTS rental_return_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_line_id uuid NOT NULL REFERENCES rental_booking_lines(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES business_documents(id) ON DELETE CASCADE,
  image_key varchar(500) NOT NULL,
  caption varchar(255),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_return_photos_line_idx
  ON rental_return_photos (tenant_id, booking_line_id);

ALTER TABLE rental_return_photos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rental_return_photos'
      AND policyname = 'rental_return_photos_isolation'
  ) THEN
    CREATE POLICY rental_return_photos_isolation ON rental_return_photos
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
