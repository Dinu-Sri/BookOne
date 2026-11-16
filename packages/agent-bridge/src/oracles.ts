import { createHash } from 'node:crypto';
import { defaultPolicy, type CompanyPolicy, type ExtractedFacts } from './contracts';
import { money, percentOfMinor, type Money } from './money';

export type GoldenCaseId =
  | 'supported-vat-service'
  | 'supported-non-vat'
  | 'discount-rounding'
  | 'missing-supplier'
  | 'conflicting-totals'
  | 'ambiguous-date-currency'
  | 'duplicate-scan'
  | 'unsupported-paid'
  | 'unsupported-stock';

export type GoldenCase = {
  id: GoldenCaseId;
  title: string;
  policy: CompanyPolicy;
  facts: ExtractedFacts;
  content: string;
  expected: {
    accept: boolean;
    clarificationCodes: string[];
    net?: Money;
    vat?: Money;
    gross?: Money;
    expenseAccount?: string;
    payableAccount?: string;
    journal?: { accountCode: string; side: 'debit' | 'credit'; minor: number }[];
  };
};

function vatPolicy(): CompanyPolicy {
  return defaultPolicy({ vatRegistered: true, vatRatePercent: 18 });
}

function commercialPolicy(): CompanyPolicy {
  return defaultPolicy({ vatRegistered: false, vatRatePercent: 0 });
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: 'supported-vat-service',
    title: 'Unpaid service invoice with configured 18% input VAT',
    policy: vatPolicy(),
    content: 'ABC Supplies INV-1001 2026-03-01 LKR net 1000.00 VAT 180.00 total 1180.00 unpaid office expenses',
    facts: {
      supplierName: { value: 'ABC Supplies', origin: 'observed', page: 1 },
      supplierInvoiceNumber: { value: 'INV-1001', origin: 'observed', page: 1 },
      issueDate: { value: '2026-03-01', origin: 'observed', page: 1 },
      currency: { value: 'LKR', origin: 'observed', page: 1 },
      paidStatus: { value: 'unpaid', origin: 'observed', page: 1 },
      documentKind: { value: 'service_expense', origin: 'observed', page: 1 },
      net: { value: money(100000), origin: 'observed', page: 1 },
      tax: { value: money(18000), origin: 'observed', page: 1 },
      gross: { value: money(118000), origin: 'observed', page: 1 },
      lineDescription: { value: 'Monthly accounting support', origin: 'observed', page: 1 },
    },
    expected: {
      accept: true,
      clarificationCodes: [],
      net: money(100000),
      vat: money(18000),
      gross: money(118000),
      expenseAccount: '6800',
      payableAccount: '2100',
      journal: [
        { accountCode: '6800', side: 'debit', minor: 100000 },
        { accountCode: '2300', side: 'debit', minor: 18000 },
        { accountCode: '2100', side: 'credit', minor: 118000 },
      ],
    },
  },
  {
    id: 'supported-non-vat',
    title: 'Commercial unpaid expense, no input VAT',
    policy: commercialPolicy(),
    content: 'Office Mart INV-2002 2026-03-02 LKR 600.00 commercial unpaid',
    facts: {
      supplierName: { value: 'Office Mart', origin: 'observed', page: 1 },
      supplierInvoiceNumber: { value: 'INV-2002', origin: 'observed', page: 1 },
      issueDate: { value: '2026-03-02', origin: 'observed', page: 1 },
      currency: { value: 'LKR', origin: 'observed', page: 1 },
      paidStatus: { value: 'unpaid', origin: 'observed', page: 1 },
      documentKind: { value: 'service_expense', origin: 'observed', page: 1 },
      net: { value: money(60000), origin: 'observed', page: 1 },
      tax: { value: money(0), origin: 'observed', page: 1 },
      gross: { value: money(60000), origin: 'observed', page: 1 },
      lineDescription: { value: 'Stationery', origin: 'observed', page: 1 },
    },
    expected: {
      accept: true,
      clarificationCodes: [],
      net: money(60000),
      vat: money(0),
      gross: money(60000),
      expenseAccount: '6800',
      payableAccount: '2100',
      journal: [
        { accountCode: '6800', side: 'debit', minor: 60000 },
        { accountCode: '2100', side: 'credit', minor: 60000 },
      ],
    },
  },
  {
    id: 'discount-rounding',
    title: 'Discounted net 999 cents VAT 18%',
    policy: vatPolicy(),
    content: 'ABC Supplies INV-1003 2026-03-03 LKR net 9.99 VAT',
    facts: {
      supplierName: { value: 'ABC Supplies', origin: 'observed' },
      supplierInvoiceNumber: { value: 'INV-1003', origin: 'observed' },
      issueDate: { value: '2026-03-03', origin: 'observed' },
      currency: { value: 'LKR', origin: 'observed' },
      paidStatus: { value: 'unpaid', origin: 'observed' },
      documentKind: { value: 'service_expense', origin: 'observed' },
      net: { value: money(999), origin: 'observed' },
      tax: { value: money(percentOfMinor(999, 18)), origin: 'inferred' },
      gross: { value: money(999 + percentOfMinor(999, 18)), origin: 'inferred' },
      lineDescription: { value: 'Support retainer', origin: 'observed' },
    },
    expected: {
      accept: true,
      clarificationCodes: [],
      net: money(999),
      vat: money(percentOfMinor(999, 18)),
      gross: money(999 + percentOfMinor(999, 18)),
      expenseAccount: '6800',
      payableAccount: '2100',
    },
  },
  {
    id: 'missing-supplier',
    title: 'Missing supplier name',
    policy: vatPolicy(),
    content: 'INV-x 2026-03-04 LKR 100.00 unpaid',
    facts: {
      supplierInvoiceNumber: { value: 'INV-X', origin: 'observed' },
      issueDate: { value: '2026-03-04', origin: 'observed' },
      currency: { value: 'LKR', origin: 'observed' },
      paidStatus: { value: 'unpaid', origin: 'observed' },
      documentKind: { value: 'service_expense', origin: 'observed' },
      net: { value: money(10000), origin: 'observed' },
      tax: { value: money(1800), origin: 'observed' },
      gross: { value: money(11800), origin: 'observed' },
    },
    expected: { accept: false, clarificationCodes: ['MISSING_SUPPLIER'] },
  },
  {
    id: 'conflicting-totals',
    title: 'Net plus tax does not equal gross',
    policy: vatPolicy(),
    content: 'ABC Supplies INV-bad 2026-03-05 LKR 1000 + 180 != 2000',
    facts: {
      supplierName: { value: 'ABC Supplies', origin: 'observed' },
      supplierInvoiceNumber: { value: 'INV-BAD', origin: 'observed' },
      issueDate: { value: '2026-03-05', origin: 'observed' },
      currency: { value: 'LKR', origin: 'observed' },
      paidStatus: { value: 'unpaid', origin: 'observed' },
      documentKind: { value: 'service_expense', origin: 'observed' },
      net: { value: money(100000), origin: 'observed' },
      tax: { value: money(18000), origin: 'observed' },
      gross: { value: money(200000), origin: 'observed' },
    },
    expected: { accept: false, clarificationCodes: ['CONFLICTING_TOTALS'] },
  },
  {
    id: 'ambiguous-date-currency',
    title: 'Ambiguous date and currency',
    policy: vatPolicy(),
    content: 'ABC Supplies INV-amb 03/04/26 USD',
    facts: {
      supplierName: { value: 'ABC Supplies', origin: 'observed' },
      supplierInvoiceNumber: { value: 'INV-AMB', origin: 'observed' },
      issueDate: { value: '03/04/26', origin: 'observed' },
      paidStatus: { value: 'unpaid', origin: 'observed' },
      documentKind: { value: 'service_expense', origin: 'observed' },
      net: { value: money(100000), origin: 'observed' },
    },
    expected: { accept: false, clarificationCodes: ['AMBIGUOUS_DATE', 'AMBIGUOUS_CURRENCY'] },
  },
  {
    id: 'duplicate-scan',
    title: 'Same file hash received twice',
    policy: vatPolicy(),
    content: 'ABC Supplies INV-1001 duplicate file',
    facts: {
      supplierName: { value: 'ABC Supplies', origin: 'observed' },
      supplierInvoiceNumber: { value: 'INV-1001', origin: 'observed' },
      issueDate: { value: '2026-03-01', origin: 'observed' },
      currency: { value: 'LKR', origin: 'observed' },
      paidStatus: { value: 'unpaid', origin: 'observed' },
      documentKind: { value: 'service_expense', origin: 'observed' },
      net: { value: money(100000), origin: 'observed' },
      tax: { value: money(18000), origin: 'observed' },
      gross: { value: money(118000), origin: 'observed' },
    },
    expected: { accept: false, clarificationCodes: ['DUPLICATE_SCAN'] },
  },
  {
    id: 'unsupported-paid',
    title: 'Paid invoice is not converted into an unpaid bill',
    policy: vatPolicy(),
    content: 'ABC Supplies INV-PAID PAID IN FULL',
    facts: {
      supplierName: { value: 'ABC Supplies', origin: 'observed' },
      supplierInvoiceNumber: { value: 'INV-PAID', origin: 'observed' },
      issueDate: { value: '2026-03-06', origin: 'observed' },
      currency: { value: 'LKR', origin: 'observed' },
      paidStatus: { value: 'paid', origin: 'observed' },
      documentKind: { value: 'service_expense', origin: 'observed' },
      net: { value: money(100000), origin: 'observed' },
      tax: { value: money(18000), origin: 'observed' },
      gross: { value: money(118000), origin: 'observed' },
      rawText: 'PAID IN FULL thank you',
    },
    expected: { accept: false, clarificationCodes: ['UNSUPPORTED_PAID'] },
  },
  {
    id: 'unsupported-stock',
    title: 'Stock invoice is not a service bill',
    policy: vatPolicy(),
    content: 'ABC Supplies 10 chairs stock',
    facts: {
      supplierName: { value: 'ABC Supplies', origin: 'observed' },
      supplierInvoiceNumber: { value: 'INV-STK', origin: 'observed' },
      issueDate: { value: '2026-03-07', origin: 'observed' },
      currency: { value: 'LKR', origin: 'observed' },
      paidStatus: { value: 'unpaid', origin: 'observed' },
      documentKind: { value: 'stock', origin: 'observed' },
      net: { value: money(500000), origin: 'observed' },
      tax: { value: money(90000), origin: 'observed' },
      gross: { value: money(590000), origin: 'observed' },
    },
    expected: { accept: false, clarificationCodes: ['UNSUPPORTED_STOCK'] },
  },
];

export function goldenById(id: GoldenCaseId): GoldenCase {
  const hit = GOLDEN_CASES.find((c) => c.id === id);
  if (!hit) throw new Error(`Unknown golden case ${id}`);
  return hit;
}

export function fixtureHash(id: GoldenCaseId): string {
  return createHash('sha256').update(`fixture:${id}`).digest('hex');
}

export function caseIdFromHash(hash: string): GoldenCaseId | null {
  for (const c of GOLDEN_CASES) {
    if (fixtureHash(c.id) === hash) return c.id;
  }
  return null;
}

/** Independent expected VAT — integer cents, not the production helper. */
export function oracleVatMinor(netMinor: number, vatRegistered: boolean, ratePercent: number): number {
  if (!vatRegistered || ratePercent <= 0) return 0;
  return percentOfMinor(netMinor, ratePercent);
}
