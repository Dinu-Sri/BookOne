ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS website varchar(320);

ALTER TABLE brands ADD COLUMN IF NOT EXISTS website varchar(320);
ALTER TABLE brands ADD COLUMN IF NOT EXISTS bank_details text;
