/**
 * Isolated DB-01 synthetic fixture.
 * Expected totals are computed in independentExpected() with a separate
 * per-account accumulator — not composeDashboardMetrics.
 */
import type { AgingDocument, DashboardJournalLine } from './dashboard-metrics';

export const DB01_PERIOD = { from: '2026-03-01', to: '2026-03-15' } as const;
export const DB01_AS_OF = '2026-03-15';
export const DB01_CURRENCY = 'LKR';
export const DB01_TENANT_A = 'tenant-a';
export const DB01_TENANT_B = 'tenant-b';

type FxLine = DashboardJournalLine & { accountName: string };

const COA: Record<string, { name: string; type: string }> = {
  '1000': { name: 'Cash on Hand', type: 'asset' },
  '1100': { name: 'Commercial Bank', type: 'asset' },
  '1200': { name: 'Card Clearing', type: 'asset' },
  '1300': { name: 'Accounts Receivable', type: 'asset' },
  '2100': { name: 'Accounts Payable', type: 'liability' },
  '2200': { name: 'Output VAT', type: 'liability' },
  '2300': { name: 'Input VAT', type: 'asset' },
  '2500': { name: 'Personal Loans Payable', type: 'liability' },
  '3000': { name: 'Owner Equity', type: 'equity' },
  '3100': { name: 'Owner Drawings', type: 'equity' },
  '4000': { name: 'Sales Revenue', type: 'revenue' },
  '4100': { name: 'Sales Returns', type: 'revenue' },
  '5000': { name: 'Cost of Goods Sold', type: 'expense' },
  '5100': { name: 'Inventory', type: 'asset' },
  '6000': { name: 'Marketing Expense', type: 'expense' },
  '6100': { name: 'Rent Expense', type: 'expense' },
  '6400': { name: 'Travel Expense', type: 'expense' },
  '6800': { name: 'General Expense', type: 'expense' },
};

function L(
  journalId: string,
  date: string,
  code: string,
  side: 'debit' | 'credit',
  amount: number,
  extra?: Partial<FxLine>,
): FxLine {
  const meta = COA[code]!;
  return {
    journalId,
    date,
    accountCode: code,
    accountType: meta.type,
    accountName: meta.name,
    side,
    amount,
    tenantId: DB01_TENANT_A,
    ...extra,
  };
}

/** Posted journals for tenant A. Later allocations after the cutoff stay in the set. */
export const DB01_JOURNALS: FxLine[] = [
  L('OPEN1', '2026-02-28', '1000', 'debit', 5000),
  L('OPEN1', '2026-02-28', '3000', 'credit', 5000),
  L('OPEN2', '2026-02-28', '1100', 'debit', 20000),
  L('OPEN2', '2026-02-28', '3000', 'credit', 20000),
  L('OPEN3', '2026-02-28', '5100', 'debit', 500),
  L('OPEN3', '2026-02-28', '3000', 'credit', 500),
  L('PREV_SALE', '2026-02-20', '1000', 'debit', 400),
  L('PREV_SALE', '2026-02-20', '4000', 'credit', 400),

  L('SALE_CASH', '2026-03-02', '1000', 'debit', 1180),
  L('SALE_CASH', '2026-03-02', '4000', 'credit', 1000),
  L('SALE_CASH', '2026-03-02', '2200', 'credit', 180),

  L('SALE_CREDIT', '2026-03-03', '1300', 'debit', 2360),
  L('SALE_CREDIT', '2026-03-03', '4000', 'credit', 2000),
  L('SALE_CREDIT', '2026-03-03', '2200', 'credit', 360),

  L('SALE_DISCOUNT', '2026-03-04', '1000', 'debit', 1062),
  L('SALE_DISCOUNT', '2026-03-04', '4000', 'credit', 900),
  L('SALE_DISCOUNT', '2026-03-04', '2200', 'credit', 162),

  L('SALE_RETURN', '2026-03-05', '4100', 'debit', 200),
  L('SALE_RETURN', '2026-03-05', '2200', 'debit', 36),
  L('SALE_RETURN', '2026-03-05', '1000', 'credit', 236),

  L('COGS', '2026-03-05', '5000', 'debit', 150),
  L('COGS', '2026-03-05', '5100', 'credit', 150),

  L('BILL', '2026-03-07', '6800', 'debit', 500),
  L('BILL', '2026-03-07', '2300', 'debit', 90),
  L('BILL', '2026-03-07', '2100', 'credit', 590),

  L('TRANSFER', '2026-03-08', '1100', 'debit', 1000),
  L('TRANSFER', '2026-03-08', '1000', 'credit', 1000),

  L('FUNDING', '2026-03-09', '1000', 'debit', 3000),
  L('FUNDING', '2026-03-09', '3000', 'credit', 3000),

  L('AR_PARTIAL', '2026-03-10', '1000', 'debit', 1000),
  L('AR_PARTIAL', '2026-03-10', '1300', 'credit', 1000),

  L('LOAN', '2026-03-11', '1100', 'debit', 5000),
  L('LOAN', '2026-03-11', '2500', 'credit', 5000),

  L('AP_PARTIAL', '2026-03-12', '2100', 'debit', 200),
  L('AP_PARTIAL', '2026-03-12', '1100', 'credit', 200),

  L('CARD_SALE', '2026-03-13', '1200', 'debit', 590),
  L('CARD_SALE', '2026-03-13', '4000', 'credit', 500),
  L('CARD_SALE', '2026-03-13', '2200', 'credit', 90),

  L('RENT', '2026-03-14', '6100', 'debit', 800),
  L('RENT', '2026-03-14', '1100', 'credit', 800),

  L('MARKETING', '2026-03-14', '6000', 'debit', 120),
  L('MARKETING', '2026-03-14', '1100', 'credit', 120),

  L('TRAVEL', '2026-03-02', '6400', 'debit', 50),
  L('TRAVEL', '2026-03-02', '1000', 'credit', 50),
  L('TRAVEL_REV', '2026-03-02', '1000', 'debit', 50),
  L('TRAVEL_REV', '2026-03-02', '6400', 'credit', 50),

  L('DRAW', '2026-03-15', '3100', 'debit', 2000),
  L('DRAW', '2026-03-15', '1000', 'credit', 2000),

  L('VOIDED', '2026-03-06', '6800', 'debit', 99, { voided: true }),
  L('VOIDED', '2026-03-06', '1000', 'credit', 99, { voided: true }),

  L('LATER_AR', '2026-03-20', '1000', 'debit', 500),
  L('LATER_AR', '2026-03-20', '1300', 'credit', 500),
];

/** Tenant B journals must never leak into tenant A totals. */
export const DB01_TENANT_B_JOURNALS: FxLine[] = [
  L('B_SALE', '2026-03-04', '1000', 'debit', 9999, { tenantId: DB01_TENANT_B }),
  L('B_SALE', '2026-03-04', '4000', 'credit', 9999, { tenantId: DB01_TENANT_B }),
];

export const DB01_AR_DOCUMENTS: AgingDocument[] = [
  {
    id: 'inv-1',
    documentNumber: 'INV-1',
    partyName: 'Customer One',
    issueDate: '2026-03-03',
    dueDate: '2026-03-10',
    balanceDue: 860,
    laterSettlements: 500,
    href: '/sales/invoices/inv-1',
  },
];

export const DB01_AP_DOCUMENTS: AgingDocument[] = [
  {
    id: 'bill-1',
    documentNumber: 'BILL-1',
    partyName: 'Vendor One',
    issueDate: '2026-03-07',
    dueDate: '2026-02-28',
    balanceDue: 390,
    laterSettlements: 0,
    href: '/purchase/purchases/bill-1',
  },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function signed(type: string, debit: number, credit: number): number {
  if (type === 'asset' || type === 'expense') return round2(debit - credit);
  return round2(credit - debit);
}

function windowed(lines: FxLine[], from: string | null, to: string | null): FxLine[] {
  return lines.filter((line) => {
    if (line.voided) return false;
    if (line.tenantId && line.tenantId !== DB01_TENANT_A) return false;
    if (from && line.date < from) return false;
    if (to && line.date > to) return false;
    return true;
  });
}

function accountMap(lines: FxLine[]): Map<string, { type: string; debit: number; credit: number }> {
  const map = new Map<string, { type: string; debit: number; credit: number }>();
  for (const line of lines) {
    const cur = map.get(line.accountCode) ?? { type: line.accountType, debit: 0, credit: 0 };
    if (line.side === 'debit') cur.debit += line.amount;
    else cur.credit += line.amount;
    map.set(line.accountCode, cur);
  }
  return map;
}

function bal(map: Map<string, { type: string; debit: number; credit: number }>, code: string): number {
  const row = map.get(code);
  if (!row) return 0;
  return signed(row.type, row.debit, row.credit);
}

/**
 * Independently computed expected results for 2026-03-01..2026-03-15.
 * Hand-checked constants plus a separate accumulator; does not call composeDashboardMetrics.
 */
export function independentExpected() {
  const period = windowed(DB01_JOURNALS, DB01_PERIOD.from, DB01_PERIOD.to);
  const asOf = windowed(DB01_JOURNALS, null, DB01_AS_OF);
  const opening = windowed(DB01_JOURNALS, null, '2026-02-28');
  const periodMap = accountMap(period);
  const asOfMap = accountMap(asOf);
  const openingMap = accountMap(opening);

  const netSales = round2(bal(periodMap, '4000') + bal(periodMap, '4100'));
  const revenue = [...periodMap.entries()]
    .filter(([code]) => COA[code]?.type === 'revenue')
    .reduce((sum, [code]) => sum + bal(periodMap, code), 0);
  const expense = [...periodMap.entries()]
    .filter(([code]) => COA[code]?.type === 'expense')
    .reduce((sum, [code]) => sum + bal(periodMap, code), 0);
  const operatingResult = round2(revenue - expense);

  const openingUniverse = round2(bal(openingMap, '1000') + bal(openingMap, '1100') + bal(openingMap, '1200'));
  const closingUniverse = round2(bal(asOfMap, '1000') + bal(asOfMap, '1100') + bal(asOfMap, '1200'));
  const cashAndBank = round2(bal(asOfMap, '1000') + bal(asOfMap, '1100'));
  const cardClearing = bal(asOfMap, '1200');
  const receivables = bal(asOfMap, '1300');
  const payables = bal(asOfMap, '2100');

  const cashCodes = new Set(['1000', '1100', '1200']);
  const fundingCodes = new Set(['3000', '3100', '2500', '1400']);
  const byJournal = new Map<string, FxLine[]>();
  for (const line of period) {
    const list = byJournal.get(line.journalId) ?? [];
    list.push(line);
    byJournal.set(line.journalId, list);
  }
  let moneyIn = 0;
  let moneyOut = 0;
  let transferIn = 0;
  let transferOut = 0;
  let fundingIn = 0;
  let fundingOut = 0;
  let universeIn = 0;
  let universeOut = 0;
  for (const lines of byJournal.values()) {
    const cashLines = lines.filter((l) => cashCodes.has(l.accountCode) && l.amount !== 0);
    const other = lines.filter((l) => !cashCodes.has(l.accountCode) && l.amount !== 0);
    const isTransfer =
      cashLines.length >= 2 &&
      other.length === 0 &&
      cashLines.some((l) => l.side === 'debit') &&
      cashLines.some((l) => l.side === 'credit');
    const isFunding = other.some((l) => fundingCodes.has(l.accountCode));
    for (const line of cashLines) {
      if (line.side === 'debit') {
        universeIn += line.amount;
        if (isTransfer) transferIn += line.amount;
        else {
          moneyIn += line.amount;
          if (isFunding) fundingIn += line.amount;
        }
      } else {
        universeOut += line.amount;
        if (isTransfer) transferOut += line.amount;
        else {
          moneyOut += line.amount;
          if (isFunding) fundingOut += line.amount;
        }
      }
    }
  }

  const netCashMovement = round2(universeIn - universeOut);
  const arAging = 1360;
  const apAging = 390;

  return {
    netSales: 4200,
    operatingResult: 2630,
    netCashMovement: 8476,
    cashAndBank: 33286,
    cardClearing: 590,
    receivables: 1360,
    payables: 390,
    externalMoneyIn: 11882,
    externalMoneyOut: 3406,
    transferIn: 1000,
    transferOut: 1000,
    fundingIn: 8000,
    fundingOut: 2000,
    openingUniverse: 25400,
    closingUniverse: 33876,
    arAging,
    apAging,
    arControlDifference: 0,
    apControlDifference: 0,
    overdueAr: 1360,
    overdueAp: 390,
    previousNetSales: 400,
    computed: {
      netSales,
      operatingResult,
      openingUniverse,
      closingUniverse,
      cashAndBank,
      cardClearing,
      receivables,
      payables,
      moneyIn: round2(moneyIn),
      moneyOut: round2(moneyOut),
      transferIn: round2(transferIn),
      transferOut: round2(transferOut),
      fundingIn: round2(fundingIn),
      fundingOut: round2(fundingOut),
      netCashMovement,
    },
  };
}

export function db01PeriodLines(): DashboardJournalLine[] {
  return windowed(DB01_JOURNALS, DB01_PERIOD.from, DB01_PERIOD.to);
}

export function db01AsOfLines(): DashboardJournalLine[] {
  return windowed(DB01_JOURNALS, null, DB01_AS_OF);
}

export function db01OpeningLines(): DashboardJournalLine[] {
  return windowed(DB01_JOURNALS, null, '2026-02-28');
}
