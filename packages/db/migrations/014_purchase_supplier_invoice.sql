-- Purchase P1: supplier invoice number on commercial documents
ALTER TABLE business_documents
  ADD COLUMN IF NOT EXISTS supplier_invoice_number varchar(80);
