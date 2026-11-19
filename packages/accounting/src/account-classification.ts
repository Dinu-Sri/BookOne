/**
 * Semantic account classification. Codes identify a company account;
 * subtype, liquidity, cash-flow class and control role drive selectors,
 * dashboard cash, tenders and reports. Do not grow hardcoded code lists
 * for new banks or advances.
 */

export type AccountRootClass = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type AccountSubtype =
  | 'cash'
  | 'bank'
  | 'card_clearing'
  | 'receivable'
  | 'supplier_advance'
  | 'staff_advance'
  | 'inventory'
  | 'fixed_asset'
  | 'accum_depreciation'
  | 'input_tax'
  | 'other_asset'
  | 'payable'
  | 'customer_advance'
  | 'deposit'
  | 'output_tax'
  | 'grni'
  | 'loan'
  | 'other_liability'
  | 'equity'
  | 'drawings'
  | 'sales'
  | 'sales_return'
  | 'other_income'
  | 'cogs'
  | 'operating_expense'
  | 'group';

export type CashFlowClass = 'operating' | 'investing' | 'financing' | 'none';
export type Liquidity = 'cash' | 'bank' | 'card_clearing' | 'none';
export type ControlRole =
  | 'none'
  | 'ar'
  | 'ap'
  | 'vat_output'
  | 'vat_input'
  | 'inventory'
  | 'grni'
  | 'cogs'
  | 'sales'
  | 'sales_return'
  | 'equity'
  | 'drawings'
  | 'customer_advance'
  | 'supplier_advance'
  | 'staff_advance'
  | 'deposit'
  | 'card_clearing'
  | 'cash'
  | 'bank';

export type ClassifiedAccount = {
  code: string;
  type: AccountRootClass;
  normalSide: 'debit' | 'credit';
  subtype: AccountSubtype;
  purpose: string;
  isGroup: boolean;
  isSystem: boolean;
  isContra: boolean;
  cashFlowClass: CashFlowClass;
  liquidity: Liquidity;
  reconcilable: boolean;
  controlRole: ControlRole;
};

export type AccountClassificationInput = {
  code: string;
  type?: string | null;
  normalSide?: string | null;
  subtype?: string | null;
  purpose?: string | null;
  isGroup?: string | boolean | null;
  isSystem?: string | boolean | null;
  isContra?: string | boolean | null;
  cashFlowClass?: string | null;
  liquidity?: string | null;
  reconcilable?: string | boolean | null;
  controlRole?: string | null;
};

const FLAG_TRUE = new Set(['1', 'true', 'yes', 'y']);

function flag(value: string | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  return FLAG_TRUE.has(String(value ?? '').trim().toLowerCase());
}

export function normalSideFor(
  type: AccountRootClass,
  opts?: { isContra?: boolean },
): 'debit' | 'credit' {
  const natural: 'debit' | 'credit' =
    type === 'asset' || type === 'expense' ? 'debit' : 'credit';
  if (opts?.isContra) return natural === 'debit' ? 'credit' : 'debit';
  return natural;
}

export function isRootClass(value: string | null | undefined): value is AccountRootClass {
  return value === 'asset' || value === 'liability' || value === 'equity' || value === 'revenue' || value === 'expense';
}

/** Cash family (10xx, including 1000) plus classified/custom banks (11xx). */
export function isSpendableCashCode(code: string): boolean {
  return /^10\d{2}$/.test(code) || /^11\d{2}$/.test(code);
}

/** Card clearing family, including custom 12xx. */
export function isCardClearingCode(code: string): boolean {
  return /^12\d{2}$/.test(code);
}

/** Spendable cash/bank plus card clearing. */
export function isCashUniverseCode(code: string): boolean {
  return isSpendableCashCode(code) || isCardClearingCode(code);
}

/** Payment-tender family used by cashbook tiles and receipts. */
export function isLiquidTenderFamily(code: string): boolean {
  return isCashUniverseCode(code);
}

export function isCustomBankCode(code: string): boolean {
  return /^11\d{2}$/.test(code) && code !== '1100';
}

type SeedHint = Omit<ClassifiedAccount, 'code' | 'type' | 'normalSide'>;

const SEED_BY_CODE: Record<string, SeedHint> = {
  '1000': {
    subtype: 'cash',
    purpose: 'tender',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'cash',
    reconcilable: true,
    controlRole: 'cash',
  },
  '1100': {
    subtype: 'bank',
    purpose: 'tender',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'bank',
    reconcilable: true,
    controlRole: 'bank',
  },
  '1200': {
    subtype: 'card_clearing',
    purpose: 'clearing',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'card_clearing',
    reconcilable: true,
    controlRole: 'card_clearing',
  },
  '1300': {
    subtype: 'receivable',
    purpose: 'control',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'ar',
  },
  '1350': {
    subtype: 'supplier_advance',
    purpose: 'advance',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'supplier_advance',
  },
  '1360': {
    subtype: 'staff_advance',
    purpose: 'advance',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'staff_advance',
  },
  '1400': {
    subtype: 'other_asset',
    purpose: 'loan_receivable',
    isGroup: false,
    isSystem: false,
    isContra: false,
    cashFlowClass: 'financing',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'none',
  },
  '2100': {
    subtype: 'payable',
    purpose: 'control',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'ap',
  },
  '2150': {
    subtype: 'grni',
    purpose: 'control',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'grni',
  },
  '2200': {
    subtype: 'output_tax',
    purpose: 'tax',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'vat_output',
  },
  '2300': {
    subtype: 'input_tax',
    purpose: 'tax',
    isGroup: false,
    isSystem: true,
    isContra: true,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'vat_input',
  },
  '2400': {
    subtype: 'deposit',
    purpose: 'deposit',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'deposit',
  },
  '2410': {
    subtype: 'customer_advance',
    purpose: 'advance',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'customer_advance',
  },
  '2500': {
    subtype: 'loan',
    purpose: 'loan_payable',
    isGroup: false,
    isSystem: false,
    isContra: false,
    cashFlowClass: 'financing',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'none',
  },
  '3000': {
    subtype: 'equity',
    purpose: 'equity',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'financing',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'equity',
  },
  '3100': {
    subtype: 'drawings',
    purpose: 'equity',
    isGroup: false,
    isSystem: true,
    isContra: true,
    cashFlowClass: 'financing',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'drawings',
  },
  '4000': {
    subtype: 'sales',
    purpose: 'income',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'sales',
  },
  '4100': {
    subtype: 'sales_return',
    purpose: 'income',
    isGroup: false,
    isSystem: true,
    isContra: true,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'sales_return',
  },
  '4200': {
    subtype: 'other_income',
    purpose: 'income',
    isGroup: false,
    isSystem: false,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'none',
  },
  '4300': {
    subtype: 'other_income',
    purpose: 'income',
    isGroup: false,
    isSystem: false,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'none',
  },
  '4400': {
    subtype: 'other_income',
    purpose: 'income',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'none',
  },
  '4450': {
    subtype: 'other_income',
    purpose: 'income',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'none',
  },
  '5000': {
    subtype: 'cogs',
    purpose: 'cogs',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'cogs',
  },
  '5100': {
    subtype: 'inventory',
    purpose: 'control',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'inventory',
  },
  '5150': {
    subtype: 'operating_expense',
    purpose: 'expense',
    isGroup: false,
    isSystem: true,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'none',
  },
};

function familyHint(code: string): SeedHint | null {
  if (SEED_BY_CODE[code]) return SEED_BY_CODE[code]!;
  if (/^11\d{2}$/.test(code)) {
    return {
      subtype: 'bank',
      purpose: 'tender',
      isGroup: false,
      isSystem: code === '1100',
      isContra: false,
      cashFlowClass: 'operating',
      liquidity: 'bank',
      reconcilable: true,
      controlRole: 'bank',
    };
  }
  if (/^12\d{2}$/.test(code)) {
    return {
      subtype: 'card_clearing',
      purpose: 'clearing',
      isGroup: false,
      isSystem: code === '1200',
      isContra: false,
      cashFlowClass: 'operating',
      liquidity: 'card_clearing',
      reconcilable: true,
      controlRole: 'card_clearing',
    };
  }
  if (/^10\d{2}$/.test(code)) {
    return {
      subtype: 'cash',
      purpose: 'tender',
      isGroup: false,
      isSystem: code === '1000',
      isContra: false,
      cashFlowClass: 'operating',
      liquidity: 'cash',
      reconcilable: true,
      controlRole: 'cash',
    };
  }
  return null;
}

function defaultHintForType(type: AccountRootClass): SeedHint {
  if (type === 'asset') {
    return {
      subtype: 'other_asset',
      purpose: 'asset',
      isGroup: false,
      isSystem: false,
      isContra: false,
      cashFlowClass: 'operating',
      liquidity: 'none',
      reconcilable: false,
      controlRole: 'none',
    };
  }
  if (type === 'liability') {
    return {
      subtype: 'other_liability',
      purpose: 'liability',
      isGroup: false,
      isSystem: false,
      isContra: false,
      cashFlowClass: 'operating',
      liquidity: 'none',
      reconcilable: false,
      controlRole: 'none',
    };
  }
  if (type === 'equity') {
    return {
      subtype: 'equity',
      purpose: 'equity',
      isGroup: false,
      isSystem: false,
      isContra: false,
      cashFlowClass: 'financing',
      liquidity: 'none',
      reconcilable: false,
      controlRole: 'none',
    };
  }
  if (type === 'revenue') {
    return {
      subtype: 'other_income',
      purpose: 'income',
      isGroup: false,
      isSystem: false,
      isContra: false,
      cashFlowClass: 'operating',
      liquidity: 'none',
      reconcilable: false,
      controlRole: 'none',
    };
  }
  return {
    subtype: 'operating_expense',
    purpose: 'expense',
    isGroup: false,
    isSystem: false,
    isContra: false,
    cashFlowClass: 'operating',
    liquidity: 'none',
    reconcilable: false,
    controlRole: 'none',
  };
}

function asType(value: string | null | undefined, fallback: AccountRootClass): AccountRootClass {
  return isRootClass(value) ? value : fallback;
}

function asSubtype(value: string | null | undefined, fallback: AccountSubtype): AccountSubtype {
  return (value && value.trim() ? (value.trim() as AccountSubtype) : fallback);
}

/**
 * Classify an account. Stored metadata wins when present; otherwise the
 * seeded/family map (including custom 1101–1199 banks) fills the gaps.
 */
export function classifyAccount(input: AccountClassificationInput): ClassifiedAccount {
  const code = String(input.code ?? '').trim();
  const family = familyHint(code);
  const type = asType(input.type, family ? (code.startsWith('2') ? 'liability' : code.startsWith('3') ? 'equity' : code.startsWith('4') ? 'revenue' : code.startsWith('5') && code !== '5100' && code !== '5150' ? 'expense' : code.startsWith('6') ? 'expense' : 'asset') : 'asset');
  const hint = family ?? defaultHintForType(type);
  const isContra = input.isContra == null || String(input.isContra).trim() === '' ? hint.isContra : flag(input.isContra);
  const storedSide = input.normalSide === 'debit' || input.normalSide === 'credit' ? input.normalSide : null;
  const normalSide = storedSide ?? normalSideFor(type, { isContra });
  const subtype = asSubtype(input.subtype, hint.subtype);
  const liquidity = (input.liquidity && input.liquidity.trim()
    ? (input.liquidity.trim() as Liquidity)
    : hint.liquidity);
  const cashFlowClass = (input.cashFlowClass && input.cashFlowClass.trim()
    ? (input.cashFlowClass.trim() as CashFlowClass)
    : hint.cashFlowClass);
  const controlRole = (input.controlRole && input.controlRole.trim()
    ? (input.controlRole.trim() as ControlRole)
    : hint.controlRole);
  return {
    code,
    type,
    normalSide,
    subtype,
    purpose: (input.purpose && input.purpose.trim()) || hint.purpose,
    isGroup: input.isGroup == null || String(input.isGroup).trim() === '' ? hint.isGroup : flag(input.isGroup),
    isSystem: input.isSystem == null || String(input.isSystem).trim() === '' ? hint.isSystem : flag(input.isSystem),
    isContra,
    cashFlowClass,
    liquidity,
    reconcilable:
      input.reconcilable == null || String(input.reconcilable).trim() === ''
        ? hint.reconcilable
        : flag(input.reconcilable),
    controlRole,
  };
}

export function classifyFromCode(
  code: string,
  type?: string | null,
  normalSide?: string | null,
): ClassifiedAccount {
  return classifyAccount({ code, type, normalSide });
}

export function isSpendableClassified(account: ClassifiedAccount): boolean {
  return account.liquidity === 'cash' || account.liquidity === 'bank';
}

export function isCashUniverseClassified(account: ClassifiedAccount): boolean {
  return isSpendableClassified(account) || account.liquidity === 'card_clearing';
}

export function isLiquidTenderClassified(account: ClassifiedAccount): boolean {
  return isCashUniverseClassified(account) && !account.isGroup && account.subtype !== 'group';
}

export const PROTECTED_CONTROL_ROLES: readonly ControlRole[] = [
  'ar',
  'ap',
  'vat_output',
  'vat_input',
  'inventory',
  'grni',
  'cogs',
  'sales',
  'sales_return',
  'equity',
  'customer_advance',
  'supplier_advance',
  'staff_advance',
  'deposit',
  'card_clearing',
  'cash',
  'bank',
];

export function isProtectedControl(account: ClassifiedAccount): boolean {
  return account.isSystem && account.controlRole !== 'none';
}

export type WizardTemplateId =
  | 'bank'
  | 'cash'
  | 'card_clearing'
  | 'supplier_advance'
  | 'staff_advance'
  | 'customer_advance'
  | 'expense'
  | 'income'
  | 'other_asset'
  | 'liability'
  | 'equity'
  | 'group';

export type WizardTemplate = {
  id: WizardTemplateId;
  label: string;
  help: string;
  statement: string;
  type: AccountRootClass;
  subtype: AccountSubtype;
  purpose: string;
  liquidity: Liquidity;
  cashFlowClass: CashFlowClass;
  reconcilable: boolean;
  controlRole: ControlRole;
  isGroup: boolean;
  isSystem: boolean;
  isContra: boolean;
  suggestedRange: { from: number; to: number };
};

export const ACCOUNT_WIZARD_TEMPLATES: readonly WizardTemplate[] = [
  {
    id: 'bank',
    label: 'Bank account',
    help: 'Another company bank used for receipts, payments, transfers and reconciliation.',
    statement: 'Balance sheet · current assets · cash and bank',
    type: 'asset',
    subtype: 'bank',
    purpose: 'tender',
    liquidity: 'bank',
    cashFlowClass: 'operating',
    reconcilable: true,
    controlRole: 'bank',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 1101, to: 1199 },
  },
  {
    id: 'cash',
    label: 'Cash or petty cash',
    help: 'Physical cash or a petty-cash float. Distinct from bank and card clearing.',
    statement: 'Balance sheet · current assets · cash and bank',
    type: 'asset',
    subtype: 'cash',
    purpose: 'tender',
    liquidity: 'cash',
    cashFlowClass: 'operating',
    reconcilable: true,
    controlRole: 'cash',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 1001, to: 1099 },
  },
  {
    id: 'card_clearing',
    label: 'Card clearing',
    help: 'Unsettled card receipts. Not spendable cash until the acquirer settles.',
    statement: 'Balance sheet · current assets · card clearing',
    type: 'asset',
    subtype: 'card_clearing',
    purpose: 'clearing',
    liquidity: 'card_clearing',
    cashFlowClass: 'operating',
    reconcilable: true,
    controlRole: 'card_clearing',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 1201, to: 1299 },
  },
  {
    id: 'supplier_advance',
    label: 'Supplier advance',
    help: 'Money paid to a supplier before a bill. Apply later; do not treat as an expense on issue.',
    statement: 'Balance sheet · current assets · prepayments',
    type: 'asset',
    subtype: 'supplier_advance',
    purpose: 'advance',
    liquidity: 'none',
    cashFlowClass: 'operating',
    reconcilable: false,
    controlRole: 'supplier_advance',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 1351, to: 1399 },
  },
  {
    id: 'staff_advance',
    label: 'Staff advance',
    help: 'Accountable money issued to a named staff party. Settle with expenses or unused cash.',
    statement: 'Balance sheet · current assets · staff advances',
    type: 'asset',
    subtype: 'staff_advance',
    purpose: 'advance',
    liquidity: 'none',
    cashFlowClass: 'operating',
    reconcilable: false,
    controlRole: 'staff_advance',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 1361, to: 1399 },
  },
  {
    id: 'customer_advance',
    label: 'Customer advance',
    help: 'Money received before an invoice. Liability until applied; not sales revenue on receipt.',
    statement: 'Balance sheet · current liabilities · unapplied receipts',
    type: 'liability',
    subtype: 'customer_advance',
    purpose: 'advance',
    liquidity: 'none',
    cashFlowClass: 'operating',
    reconcilable: false,
    controlRole: 'customer_advance',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 2411, to: 2499 },
  },
  {
    id: 'expense',
    label: 'Expense',
    help: 'An operating cost such as rent, utilities or bank charges. Appears on the profit and loss.',
    statement: 'Profit and loss · operating expenses',
    type: 'expense',
    subtype: 'operating_expense',
    purpose: 'expense',
    liquidity: 'none',
    cashFlowClass: 'operating',
    reconcilable: false,
    controlRole: 'none',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 6810, to: 6999 },
  },
  {
    id: 'income',
    label: 'Income',
    help: 'A revenue or other income account. Sales returns stay on the dedicated control.',
    statement: 'Profit and loss · income',
    type: 'revenue',
    subtype: 'other_income',
    purpose: 'income',
    liquidity: 'none',
    cashFlowClass: 'operating',
    reconcilable: false,
    controlRole: 'none',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 4310, to: 4399 },
  },
  {
    id: 'other_asset',
    label: 'Other asset',
    help: 'A non-cash asset such as a loan receivable or fixed asset. Does not become a payment tender.',
    statement: 'Balance sheet · assets',
    type: 'asset',
    subtype: 'other_asset',
    purpose: 'asset',
    liquidity: 'none',
    cashFlowClass: 'investing',
    reconcilable: false,
    controlRole: 'none',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 1500, to: 1999 },
  },
  {
    id: 'liability',
    label: 'Liability',
    help: 'An amount the company owes that is not AP, tax or a customer advance.',
    statement: 'Balance sheet · liabilities',
    type: 'liability',
    subtype: 'other_liability',
    purpose: 'liability',
    liquidity: 'none',
    cashFlowClass: 'financing',
    reconcilable: false,
    controlRole: 'none',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 2600, to: 2999 },
  },
  {
    id: 'equity',
    label: 'Equity',
    help: 'Owner equity or a related equity heading. Drawings stay on the dedicated control.',
    statement: 'Balance sheet · equity',
    type: 'equity',
    subtype: 'equity',
    purpose: 'equity',
    liquidity: 'none',
    cashFlowClass: 'financing',
    reconcilable: false,
    controlRole: 'none',
    isGroup: false,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 3200, to: 3999 },
  },
  {
    id: 'group',
    label: 'Group account',
    help: 'A non-posting heading. Children roll up here; journals cannot post to the group itself.',
    statement: 'Heading on the statement of its class',
    type: 'asset',
    subtype: 'group',
    purpose: 'group',
    liquidity: 'none',
    cashFlowClass: 'none',
    reconcilable: false,
    controlRole: 'none',
    isGroup: true,
    isSystem: false,
    isContra: false,
    suggestedRange: { from: 9000, to: 9099 },
  },
];

export function wizardTemplate(id: string): WizardTemplate | null {
  return ACCOUNT_WIZARD_TEMPLATES.find((row) => row.id === id) ?? null;
}

export function nextSuggestedCode(range: { from: number; to: number }, used: Iterable<string>): string | null {
  const taken = new Set([...used].map((c) => c.trim()));
  for (let n = range.from; n <= range.to; n += 1) {
    const code = String(n);
    if (!taken.has(code)) return code;
  }
  return null;
}

export function classifiedSeedValues(account: {
  code: string;
  name: string;
  type: string;
  normalSide: string;
}): {
  code: string;
  name: string;
  type: string;
  normalSide: string;
  subtype: string;
  purpose: string;
  isGroup: string;
  isSystem: string;
  isContra: string;
  cashFlowClass: string;
  liquidity: string;
  reconcilable: string;
  controlRole: string;
} {
  const cls = classifyFromCode(account.code, account.type, account.normalSide);
  return {
    code: account.code,
    name: account.name,
    type: cls.type,
    normalSide: cls.normalSide,
    subtype: cls.subtype,
    purpose: cls.purpose,
    isGroup: cls.isGroup ? '1' : '0',
    isSystem: cls.isSystem ? '1' : '0',
    isContra: cls.isContra ? '1' : '0',
    cashFlowClass: cls.cashFlowClass,
    liquidity: cls.liquidity,
    reconcilable: cls.reconcilable ? '1' : '0',
    controlRole: cls.controlRole,
  };
}

export const BUSINESS_ADVANCE_SEED_ACCOUNTS = [
  { code: '1350', name: 'Supplier Advances', type: 'asset' as const, normalSide: 'debit' as const },
  { code: '1360', name: 'Staff Advances', type: 'asset' as const, normalSide: 'debit' as const },
  { code: '2410', name: 'Customer Advances', type: 'liability' as const, normalSide: 'credit' as const },
] as const;
