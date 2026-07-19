-- P1: optional enforce customer credit limits on sales invoices
ALTER TABLE sales_settings
  ADD COLUMN IF NOT EXISTS enforce_credit_limit varchar(1) NOT NULL DEFAULT '0';
