const CLASS_LABELS: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
};

const SUBTYPE_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank',
  card_clearing: 'Card clearing',
  receivable: 'Receivable',
  payable: 'Payable',
  inventory: 'Inventory',
  supplier_advance: 'Supplier advance',
  staff_advance: 'Staff advance',
  customer_advance: 'Customer advance',
  operating_expense: 'Operating expense',
  other_income: 'Other income',
  other_asset: 'Other asset',
  other_liability: 'Other liability',
  equity: 'Equity',
  group: 'Group heading',
  deposit: 'Deposit',
  tax: 'Tax',
  sales: 'Sales',
  sales_return: 'Sales return',
  cogs: 'Cost of sales',
  grni: 'Goods received',
};

const LIQUIDITY_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank',
  card_clearing: 'Card clearing',
  none: 'Not cash',
};

const CONTROL_LABELS: Record<string, string> = {
  none: 'None',
  cash: 'Cash',
  bank: 'Bank',
  card_clearing: 'Card clearing',
  ar: 'Accounts receivable',
  ap: 'Accounts payable',
  inventory: 'Inventory',
  tax: 'Tax',
  customer_advance: 'Customer advances',
  supplier_advance: 'Supplier advances',
  staff_advance: 'Staff advances',
  deposit: 'Deposits',
  sales: 'Sales',
  sales_return: 'Sales returns',
  cogs: 'Cost of sales',
  equity: 'Equity',
  grni: 'GRNI',
};

const SIDE_LABELS: Record<string, string> = {
  debit: 'Debit',
  credit: 'Credit',
};

const KIND_LABELS: Record<string, string> = {
  customer: 'Customer advance',
  supplier: 'Supplier advance',
  staff: 'Staff advance',
};

const APPLY_LABELS: Record<string, string> = {
  apply: 'Apply to invoice or bill',
  refund: 'Refund unused',
  expense_settle: 'Staff expense settlement',
  return_cash: 'Unused cash returned',
};

function humanize(raw: string | null | undefined): string {
  if (!raw) return '—';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function classLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return CLASS_LABELS[type] ?? humanize(type);
}

export function subtypeLabel(subtype: string | null | undefined): string {
  if (!subtype) return '—';
  return SUBTYPE_LABELS[subtype] ?? humanize(subtype);
}

export function liquidityLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return LIQUIDITY_LABELS[value] ?? humanize(value);
}

export function controlLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return CONTROL_LABELS[value] ?? humanize(value);
}

export function sideLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return SIDE_LABELS[value] ?? humanize(value);
}

export function kindLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return KIND_LABELS[value] ?? humanize(value);
}

export function applyKindLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return APPLY_LABELS[value] ?? humanize(value);
}

export function statusLabel(isActive: string | null | undefined): string {
  return isActive === '0' ? 'Archived' : 'Active';
}

export const ROOT_CLASS_OPTIONS = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
];
