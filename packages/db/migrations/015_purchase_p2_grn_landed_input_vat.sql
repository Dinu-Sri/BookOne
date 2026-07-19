-- Purchase P2: Input VAT account, landed-cost fields on documents

-- Input VAT (recoverable) — asset
INSERT INTO accounts (id, tenant_id, code, name, type, normal_side, created_at, updated_at)
SELECT gen_random_uuid(), t.id, '2300', 'Input VAT', 'asset', 'debit', now(), now()
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.tenant_id = t.id AND a.code = '2300' AND a.voided_at IS NULL
);

ALTER TABLE business_documents
  ADD COLUMN IF NOT EXISTS freight_amount numeric(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE business_documents
  ADD COLUMN IF NOT EXISTS duty_amount numeric(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE business_documents
  ADD COLUMN IF NOT EXISTS other_charges numeric(18, 2) NOT NULL DEFAULT 0;
