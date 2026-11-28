-- Minimal copy of BookOne tables with the REAL column names at 9bf3468, plus the columns the guide adds in Steps 2, 7 and 8.
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(255) NOT NULL, slug varchar(100), plan varchar(20),
  environment varchar(20) DEFAULT 'production', status varchar(20) DEFAULT 'active', modules jsonb DEFAULT '{}', entity_kind varchar(20) DEFAULT 'company',
  capability_tier varchar(20), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), voided_at timestamptz);
CREATE TABLE parties (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name varchar(255) NOT NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), voided_at timestamptz);
CREATE TABLE accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), code varchar(20) NOT NULL,
  name varchar(255) NOT NULL, type varchar(20) NOT NULL, normal_side varchar(10) NOT NULL, is_active varchar(1) NOT NULL DEFAULT '1',
  is_group varchar(1) NOT NULL DEFAULT '0', control_role varchar(40), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), voided_at timestamptz);
CREATE TABLE transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
  accounting_type varchar(20) NOT NULL DEFAULT 'Income', direction varchar(20) NOT NULL DEFAULT 'money_in', party varchar(255) NOT NULL DEFAULT '',
  description varchar(1000) NOT NULL DEFAULT '', amount numeric(18,2) NOT NULL, currency varchar(5) NOT NULL DEFAULT 'LKR',
  payment_method varchar(20) NOT NULL DEFAULT 'bank', payment_account_id uuid NOT NULL, brand_id uuid, location_id uuid, book_domain varchar(20),
  transfer_source_account_id uuid, reverses_transaction_id uuid, reversed_by_transaction_id uuid, date varchar(10) NOT NULL,
  receipt_ref varchar(500), category_code varchar(20), category_name varchar(255), category_confidence numeric(3,2), category_source varchar(20),
  invoice_ref varchar(100), is_already_settled varchar(1) NOT NULL DEFAULT '0', notes text,
  source_kind varchar(40), source_id uuid,                                  -- added in Step 2
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), voided_at timestamptz);
CREATE TABLE journal_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
  transaction_id uuid NOT NULL REFERENCES transactions(id), brand_id uuid, location_id uuid, book_domain varchar(20), memo varchar(1000) NOT NULL DEFAULT '',
  entry_date varchar(10) NOT NULL, is_balanced varchar(1) NOT NULL DEFAULT '1', notes text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), voided_at timestamptz);
CREATE TABLE journal_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id), account_id uuid NOT NULL REFERENCES accounts(id), brand_id uuid, location_id uuid,
  side varchar(10) NOT NULL, amount numeric(18,2) NOT NULL, memo varchar(500),
  party_id uuid REFERENCES parties(id),                                     -- added in Step 2
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), voided_at timestamptz);
CREATE TABLE period_locks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
  period varchar(7) NOT NULL, status varchar(20) NOT NULL DEFAULT 'locked', locked_at timestamptz NOT NULL DEFAULT now(), unlocked_at timestamptz, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), voided_at timestamptz);
CREATE TABLE business_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, user_id uuid, party_id uuid, transaction_id uuid,
  document_type varchar(30) NOT NULL, status varchar(20) DEFAULT 'open', subtotal numeric(18,2) DEFAULT 0, discount_total numeric(18,2) DEFAULT 0,
  tax_total numeric(18,2) DEFAULT 0, total numeric(18,2) DEFAULT 0, paid_amount numeric(18,2) DEFAULT 0, balance_due numeric(18,2) DEFAULT 0,
  freight_amount numeric(18,2), duty_amount numeric(18,2), other_charges numeric(18,2), vat_rate numeric(6,2), posted_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), voided_at timestamptz);
CREATE TABLE inventory_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, user_id uuid, movement_type varchar(30) NOT NULL,
  product_id uuid NOT NULL, quantity numeric(18,4) NOT NULL, unit_cost numeric(18,4), from_location_id uuid, to_location_id uuid,
  reference_type varchar(40), reference_id uuid, transaction_id uuid, memo varchar(500), movement_date varchar(10) NOT NULL,
  source_line_id uuid,                                                      -- added in Step 7
  created_at timestamptz DEFAULT now());
CREATE TABLE settlement_allocations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, payment_transaction_id uuid NOT NULL,
  invoice_transaction_id uuid NOT NULL, allocated_amount numeric(18,2) NOT NULL,
  operation_key varchar(80), payer_party_id uuid, debtor_party_id uuid, third_party varchar(1) NOT NULL DEFAULT '0',   -- added in Step 8
  third_party_reason varchar(30), third_party_note varchar(500), third_party_reference varchar(120), third_party_attachment_id uuid,
  reverses_allocation_id uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), voided_at timestamptz);
