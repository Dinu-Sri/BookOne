export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  normalSide: 'debit' | 'credit';
}

export const DEFAULT_CHART_OF_ACCOUNTS: Account[] = [
  { code: '1000', name: 'Cash on Hand', type: 'asset', normalSide: 'debit' },
  { code: '1100', name: 'Commercial Bank', type: 'asset', normalSide: 'debit' },
  { code: '1200', name: 'Card Clearing', type: 'asset', normalSide: 'debit' },
  { code: '1300', name: 'Accounts Receivable', type: 'asset', normalSide: 'debit' },
  { code: '2100', name: 'Accounts Payable', type: 'liability', normalSide: 'credit' },
  { code: '3000', name: 'Owner Equity', type: 'equity', normalSide: 'credit' },
  { code: '3100', name: 'Owner Drawings', type: 'equity', normalSide: 'debit' },
  { code: '4000', name: 'Sales Revenue', type: 'revenue', normalSide: 'credit' },
  { code: '4100', name: 'Sales Returns', type: 'revenue', normalSide: 'debit' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', normalSide: 'debit' },
  { code: '5100', name: 'Inventory', type: 'asset', normalSide: 'debit' },
  { code: '6000', name: 'Marketing Expense', type: 'expense', normalSide: 'debit' },
  { code: '6100', name: 'Rent Expense', type: 'expense', normalSide: 'debit' },
  { code: '6200', name: 'Utilities Expense', type: 'expense', normalSide: 'debit' },
  { code: '6300', name: 'Salaries Expense', type: 'expense', normalSide: 'debit' },
  { code: '6400', name: 'Travel Expense', type: 'expense', normalSide: 'debit' },
  { code: '6500', name: 'Office Supplies Expense', type: 'expense', normalSide: 'debit' },
  { code: '6600', name: 'Bank Charges', type: 'expense', normalSide: 'debit' },
  { code: '6700', name: 'Insurance Expense', type: 'expense', normalSide: 'debit' },
  { code: '6800', name: 'General Expense', type: 'expense', normalSide: 'debit' },
];

export const ACCOUNTS_BY_CODE: Readonly<Record<string, Account>> = Object.freeze(
  Object.fromEntries(DEFAULT_CHART_OF_ACCOUNTS.map((a) => [a.code, a])),
);
