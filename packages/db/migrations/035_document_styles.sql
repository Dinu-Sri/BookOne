-- Document print styles (themes). Snapshot on the document so old prints do not change.

CREATE TABLE IF NOT EXISTS document_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  doc_kind varchar(30) NOT NULL,
  brand_id uuid REFERENCES brands(id),
  is_active varchar(1) NOT NULL DEFAULT '0',
  version integer NOT NULL DEFAULT 1,
  accent_color varchar(20) NOT NULL DEFAULT '#1e3a8a',
  logo_image_key varchar(500),
  logo_position varchar(20) NOT NULL DEFAULT 'left',
  show_sku varchar(1) NOT NULL DEFAULT '1',
  show_tin varchar(1) NOT NULL DEFAULT '1',
  show_phone varchar(1) NOT NULL DEFAULT '1',
  show_email varchar(1) NOT NULL DEFAULT '1',
  show_bank varchar(1) NOT NULL DEFAULT '0',
  bank_details text,
  footer_notes text,
  font_family varchar(80) NOT NULL DEFAULT 'Arial, Helvetica, sans-serif',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE INDEX IF NOT EXISTS document_styles_tenant_idx
  ON document_styles (tenant_id) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS document_styles_active_uidx
  ON document_styles (
    tenant_id,
    doc_kind,
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000')
  )
  WHERE is_active = '1' AND voided_at IS NULL;

ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS print_style_id uuid;
ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS print_style_snapshot text;

ALTER TABLE document_styles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'document_styles' AND policyname = 'document_styles_isolation'
  ) THEN
    CREATE POLICY document_styles_isolation ON document_styles
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
