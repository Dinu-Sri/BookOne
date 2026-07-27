import type { Account } from './chart-of-accounts';
import { DEFAULT_CHART_OF_ACCOUNTS } from './chart-of-accounts';

/** Lean CoA for personal workspaces (Excel-level users). */
export const PERSONAL_CHART_OF_ACCOUNTS: Account[] = [
  { code: '1000', name: 'Cash on Hand', type: 'asset', normalSide: 'debit' },
  { code: '1100', name: 'Bank Account', type: 'asset', normalSide: 'debit' },
  { code: '1400', name: 'Personal Loans Receivable', type: 'asset', normalSide: 'debit' },
  { code: '2500', name: 'Personal Loans Payable', type: 'liability', normalSide: 'credit' },
  { code: '3000', name: 'Owner Equity', type: 'equity', normalSide: 'credit' },
  { code: '3100', name: 'Owner Drawings', type: 'equity', normalSide: 'debit' },
  { code: '4200', name: 'Salary & Employment Income', type: 'revenue', normalSide: 'credit' },
  { code: '4300', name: 'Other Income', type: 'revenue', normalSide: 'credit' },
  { code: '6100', name: 'Rent & Housing', type: 'expense', normalSide: 'debit' },
  { code: '6200', name: 'Utilities', type: 'expense', normalSide: 'debit' },
  { code: '6300', name: 'Food & Household', type: 'expense', normalSide: 'debit' },
  { code: '6400', name: 'Transport', type: 'expense', normalSide: 'debit' },
  { code: '6500', name: 'Healthcare', type: 'expense', normalSide: 'debit' },
  { code: '6600', name: 'Education', type: 'expense', normalSide: 'debit' },
  { code: '6700', name: 'Insurance', type: 'expense', normalSide: 'debit' },
  { code: '6800', name: 'General Expense', type: 'expense', normalSide: 'debit' },
  { code: '6900', name: 'Loan Interest', type: 'expense', normalSide: 'debit' },
];

/** Business add-on accounts for sole prop (merge with personal pack). */
export const SOLE_BUSINESS_ADDON_ACCOUNTS: Account[] = [
  { code: '1200', name: 'Card Clearing', type: 'asset', normalSide: 'debit' },
  { code: '1300', name: 'Accounts Receivable', type: 'asset', normalSide: 'debit' },
  { code: '2100', name: 'Accounts Payable', type: 'liability', normalSide: 'credit' },
  { code: '2150', name: 'Goods Received Not Invoiced', type: 'liability', normalSide: 'credit' },
  { code: '2200', name: 'Output VAT', type: 'liability', normalSide: 'credit' },
  { code: '2300', name: 'Input VAT', type: 'asset', normalSide: 'debit' },
  { code: '4000', name: 'Sales Revenue', type: 'revenue', normalSide: 'credit' },
  { code: '4100', name: 'Sales Returns', type: 'revenue', normalSide: 'debit' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', normalSide: 'debit' },
  { code: '5100', name: 'Inventory', type: 'asset', normalSide: 'debit' },
  { code: '6000', name: 'Marketing Expense', type: 'expense', normalSide: 'debit' },
];

function mergeByCode(...packs: Account[][]): Account[] {
  const map = new Map<string, Account>();
  for (const pack of packs) {
    for (const a of pack) map.set(a.code, a);
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export type CoaPackId = 'personal' | 'sole_prop' | 'company';

export function chartOfAccountsForEntity(entityKind: string): Account[] {
  const k = (entityKind || 'company').toLowerCase();
  if (k === 'personal') return PERSONAL_CHART_OF_ACCOUNTS;
  if (k === 'sole_prop') return mergeByCode(PERSONAL_CHART_OF_ACCOUNTS, SOLE_BUSINESS_ADDON_ACCOUNTS);
  return DEFAULT_CHART_OF_ACCOUNTS;
}
