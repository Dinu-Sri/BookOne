-- Company workspaces created through web sign-up were seeded with the personal
-- chart of accounts; onboarding as "Company" only added missing codes, so
-- shared codes kept personal names (6500 "Healthcare" instead of "Office
-- Supplies Expense"). Postings resolve by code, so company expenses landed on
-- personal-named accounts.
--
-- Rename to the company pack name only when the account:
--   * belongs to a company tenant,
--   * still has the personal seeded name (never renamed by the user), and
--   * has no journal lines (posted history keeps its meaning).
-- Idempotent: safe to run on every start.

UPDATE accounts a
SET name = m.company_name,
    updated_at = NOW()
FROM (
  VALUES
    ('1100', 'Bank Account', 'Commercial Bank'),
    ('6100', 'Rent & Housing', 'Rent Expense'),
    ('6200', 'Utilities', 'Utilities Expense'),
    ('6300', 'Food & Household', 'Salaries Expense'),
    ('6400', 'Transport', 'Travel Expense'),
    ('6500', 'Healthcare', 'Office Supplies Expense'),
    ('6600', 'Education', 'Bank Charges'),
    ('6700', 'Insurance', 'Insurance Expense')
) AS m(code, personal_name, company_name)
JOIN tenants t ON t.entity_kind = 'company'
WHERE a.tenant_id = t.id
  AND a.code = m.code
  AND a.name = m.personal_name
  AND NOT EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.account_id = a.id);
