-- BookOne v2 - Parties enrichment for Sri Lanka customers/vendors
-- Additive only. Dual-role via is_customer + is_vendor; kind kept in sync.

ALTER TABLE parties ADD COLUMN IF NOT EXISTS display_name varchar(255);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS legal_name varchar(255);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS party_type varchar(20) NOT NULL DEFAULT 'company';
ALTER TABLE parties ADD COLUMN IF NOT EXISTS is_customer varchar(1) NOT NULL DEFAULT '0';
ALTER TABLE parties ADD COLUMN IF NOT EXISTS is_vendor varchar(1) NOT NULL DEFAULT '0';
ALTER TABLE parties ADD COLUMN IF NOT EXISTS nic varchar(30);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS brn varchar(50);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS tin varchar(50);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS vat_number varchar(50);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS svat_number varchar(50);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS tax_status varchar(20) NOT NULL DEFAULT 'unknown';
ALTER TABLE parties ADD COLUMN IF NOT EXISTS phone_mobile varchar(30);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS phone_landline varchar(30);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS website varchar(255);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS address_line1 varchar(255);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS address_line2 varchar(255);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS city varchar(120);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS district varchar(120);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS province varchar(120);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS postal_code varchar(40);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS country varchar(100) NOT NULL DEFAULT 'Sri Lanka';
ALTER TABLE parties ADD COLUMN IF NOT EXISTS contact_person varchar(255);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS contact_phone varchar(30);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS contact_email varchar(320);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS preferred_currency varchar(5) NOT NULL DEFAULT 'LKR';
ALTER TABLE parties ADD COLUMN IF NOT EXISTS bank_name varchar(120);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS bank_branch varchar(120);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS bank_account_name varchar(255);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS bank_account_no varchar(80);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS bank_swift varchar(30);
ALTER TABLE parties ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'active';

-- Backfill roles from kind
UPDATE parties SET
  is_customer = CASE WHEN kind IN ('customer', 'both') THEN '1' ELSE '0' END,
  is_vendor = CASE WHEN kind IN ('vendor', 'both') THEN '1' ELSE '0' END
WHERE is_customer = '0' AND is_vendor = '0';

-- Backfill address / tax / phone from legacy columns
UPDATE parties SET address_line1 = address
WHERE address IS NOT NULL AND (address_line1 IS NULL OR address_line1 = '');

UPDATE parties SET tin = tax_id
WHERE tax_id IS NOT NULL AND (tin IS NULL OR tin = '');

UPDATE parties SET phone_mobile = phone
WHERE phone IS NOT NULL AND (phone_mobile IS NULL OR phone_mobile = '');

UPDATE parties SET legal_name = name
WHERE legal_name IS NULL OR legal_name = '';

UPDATE parties SET display_name = name
WHERE display_name IS NULL OR display_name = '';

CREATE INDEX IF NOT EXISTS parties_tenant_name_idx ON parties (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS parties_tenant_code_idx ON parties (tenant_id, code) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS parties_tenant_tin_idx ON parties (tenant_id, tin) WHERE voided_at IS NULL AND tin IS NOT NULL;
CREATE INDEX IF NOT EXISTS parties_tenant_roles_idx ON parties (tenant_id, is_customer, is_vendor) WHERE voided_at IS NULL;
