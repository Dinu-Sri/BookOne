-- P2 inventory purity: GRNI on GRN, inventory settings (negative stock + average cost)

ALTER TABLE purchase_settings
  ADD COLUMN IF NOT EXISTS post_grni_on_receipt varchar(1) NOT NULL DEFAULT '0';

CREATE TABLE IF NOT EXISTS inventory_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  negative_stock_policy varchar(10) NOT NULL DEFAULT 'allow',
  costing_method varchar(20) NOT NULL DEFAULT 'last',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_settings_tenant_uq UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS inventory_settings_tenant_idx ON inventory_settings (tenant_id);

-- GRNI liability for existing tenants (idempotent)
INSERT INTO accounts (id, tenant_id, code, name, type, normal_side, created_at, updated_at)
SELECT gen_random_uuid(), t.id, '2150', 'Goods Received Not Invoiced', 'liability', 'credit', now(), now()
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a
  WHERE a.tenant_id = t.id AND a.code = '2150' AND a.voided_at IS NULL
);
