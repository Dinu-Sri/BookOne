-- QA-1126-17: concurrent postings received the same document number and party
-- code (allocation was count(*) + 1 with no lock). The app now allocates under an
-- advisory lock; these unique indexes are the database backstop.
--
-- Repair first: within a duplicate group the oldest row keeps its number, later
-- rows get a "-D2", "-D3" suffix (documents) or "-2", "-3" (party codes). Amounts,
-- journals and links are untouched. Idempotent: safe to run on every start.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, document_type, document_number
           ORDER BY created_at, id
         ) AS rn
  FROM business_documents
  WHERE document_number <> ''
)
UPDATE business_documents d
SET document_number = left(d.document_number, 44) || '-D' || ranked.rn,
    updated_at = NOW()
FROM ranked
WHERE d.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS business_documents_tenant_type_number_uq
  ON business_documents (tenant_id, document_type, document_number)
  WHERE document_number <> '';

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY tenant_id, code ORDER BY created_at, id) AS rn
  FROM parties
  WHERE code IS NOT NULL AND code <> ''
)
UPDATE parties p
SET code = left(p.code, 34) || '-' || ranked.rn,
    updated_at = NOW()
FROM ranked
WHERE p.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS parties_tenant_code_uq
  ON parties (tenant_id, code)
  WHERE code IS NOT NULL AND code <> '';
