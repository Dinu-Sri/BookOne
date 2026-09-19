ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS invoice_prefix varchar(20) NOT NULL DEFAULT 'INV';
ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS invoice_postfix varchar(20) NOT NULL DEFAULT '';
ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS invoice_pad integer NOT NULL DEFAULT 4;
ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS invoice_reset varchar(20) NOT NULL DEFAULT 'monthly';

ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS quote_prefix varchar(20) NOT NULL DEFAULT 'QT';
ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS quote_postfix varchar(20) NOT NULL DEFAULT '';
ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS quote_pad integer NOT NULL DEFAULT 4;
ALTER TABLE sales_settings ADD COLUMN IF NOT EXISTS quote_reset varchar(20) NOT NULL DEFAULT 'monthly';
