-- Print designs: versioned layouts for invoices, quotations, receipts and other print items,
-- plus the images they use (logo, signature, stamp). Additive and idempotent (runs on every boot).

CREATE TABLE IF NOT EXISTS print_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind varchar(30) NOT NULL,
  family_id uuid NOT NULL,
  name varchar(120) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status varchar(20) NOT NULL DEFAULT 'draft',
  design text NOT NULL,
  change_note text,
  created_via varchar(20) NOT NULL DEFAULT 'person',
  created_by_user_id uuid,
  agent_connection_id uuid,
  agent_label varchar(80),
  based_on_id uuid,
  approval_requested_at timestamptz,
  approved_by_user_id uuid,
  approved_at timestamptz,
  in_use varchar(1) NOT NULL DEFAULT '0',
  in_use_from timestamptz,
  in_use_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by_user_id uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS print_designs_family_version_uq ON print_designs (tenant_id, family_id, version);
CREATE INDEX IF NOT EXISTS print_designs_kind_idx ON print_designs (tenant_id, kind);
-- At most one design in use per company and print item.
CREATE UNIQUE INDEX IF NOT EXISTS print_designs_in_use_uq
  ON print_designs (tenant_id, kind) WHERE in_use = '1' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS print_design_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot varchar(20) NOT NULL,
  image_key varchar(500) NOT NULL,
  uploaded_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz
);
CREATE INDEX IF NOT EXISTS print_design_assets_slot_idx ON print_design_assets (tenant_id, slot) WHERE voided_at IS NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['print_designs', 'print_design_assets']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_isolation') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.current_tenant_id'', true))',
        t || '_isolation',
        t
      );
    END IF;
  END LOOP;
END $$;
