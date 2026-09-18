ALTER TABLE document_styles ADD COLUMN IF NOT EXISTS show_qr varchar(1) NOT NULL DEFAULT '0';
ALTER TABLE document_styles ADD COLUMN IF NOT EXISTS type_scale varchar(40) NOT NULL DEFAULT 'major_second';
ALTER TABLE document_styles ADD COLUMN IF NOT EXISTS base_font_px integer NOT NULL DEFAULT 11;

ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS edit_lock_days integer NOT NULL DEFAULT 0;

ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS public_token varchar(40);
CREATE UNIQUE INDEX IF NOT EXISTS business_documents_public_token_uidx
  ON business_documents (public_token) WHERE public_token IS NOT NULL;
