-- BookOne v2 - Business documents RLS
-- Run after drizzle-kit push creates the tables.

ALTER TABLE business_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_document_lines ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_documents'
      AND policyname = 'business_documents_isolation'
  ) THEN
    CREATE POLICY business_documents_isolation ON business_documents
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'business_document_lines'
      AND policyname = 'business_document_lines_isolation'
  ) THEN
    CREATE POLICY business_document_lines_isolation ON business_document_lines
      FOR ALL
      USING (tenant_id::text = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
  END IF;
END $$;
