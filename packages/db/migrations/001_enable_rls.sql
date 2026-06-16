-- BookOne v2 — RLS Migration 001
-- Enables Row-Level Security on all tenant-scoped tables.
-- Run AFTER drizzle-kit push creates the tables.

-- ============================================
-- Enable RLS on every tenant-scoped table
-- ============================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Create per-table RLS policies
-- ============================================

-- tenants: a tenant row is only visible to itself (via the current tenant setting)
CREATE POLICY tenants_isolation ON tenants
  FOR ALL
  USING (id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (id::text = current_setting('app.current_tenant_id', true));

-- All other tables: scoped to their tenant_id column
CREATE POLICY users_isolation ON users
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY accounts_isolation ON accounts
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY parties_isolation ON parties
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY transactions_isolation ON transactions
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY journal_entries_isolation ON journal_entries
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY journal_lines_isolation ON journal_lines
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY settlement_allocations_isolation ON settlement_allocations
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY audit_log_isolation ON audit_log
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
