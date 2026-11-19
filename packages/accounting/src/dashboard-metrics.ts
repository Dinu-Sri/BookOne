import { isCardClearingCode, isCashUniverseCode, isSpendableCashCode } from './account-classification';
import { CASH_ACCOUNT_CODES, signedCashFlow } from './cash-flow';
import { signedAccountBalance, type StatementRow } from './statement-sign';

/** Seeded spendable cash and bank. Custom 11xx banks classify through isSpendableCashCode. */
export const SPENDABLE_CASH_CODES = ['1000', '1100'] as const;
export const CARD_CLEARING_CODE = '1200';
export const CASH_UNIVERSE_CODES = CASH_ACCOUNT_CODES;
export const NET_SALES_CODES = ['4000', '4100'] as const;
export const FUNDING_ACCOUNT_CODES = ['3000', '3100', '2500', '1400'] as const;
export const RECEIVABLE_CODE = '1300';
export const PAYABLE_CODE = '2100';

export const DASHBOARD_METRIC_IDS = {
  netSales: 'DB01-NS',
  operatingResult: 'DB01-OR',
  netCashMovement: 'DB01-NCM',
  cashAndBank: 'DB01-CB',
  cardClearing: 'DB01-CC',
  receivables: 'DB01-AR',
  payables: 'DB01-AP',
  externalCashIn: 'DB01-ECI',
  externalCashOut: 'DB01-ECO',
} as const;

export const AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const MAX_DASHBOARD_RANGE_DAYS = 1826;
export const MAX_DAY_BUCKETS = 45;
export const MAX_WEEK_BUCKETS = 30;

export type DashboardJournalLine = {
  journalId: string;
  date: string;
  accountCode: string;
  accountType: string;
  accountName?: string;
  side: string;
  amount: number;
  voided?: boolean;
  tenantId?: string;
};

export type AgingDocument = {
  id: string;
  documentNumber: string;
  partyName: string;
  issueDate: string;
  dueDate: string | null;
  balanceDue: number;
  laterSettlements?: number;
  href?: string;
};

export type SeriesGrain = 'day' | 'week' | 'month';

export type SeriesPoint = {
  key: string;
  label: string;
  from: string;
  to: string;
  value: number;
  previous?: number | null;
};

export type CashSeriesPoint = SeriesPoint & {
  moneyIn: number;
  moneyOut: number;
  previousIn?: number | null;
  previousOut?: number | null;
};

export type ComparisonKind = 'pct' | 'zero-baseline' | 'missing' | 'new';

export type ComparisonChange = {
  kind: ComparisonKind;
  pct: number | null;
  label: string;
};

export type CashClassification = 'internal_transfer' | 'funding' | 'operating';

export type RankedExpense = {
  code: string;
  name: string;
  amount: number;
};

export type AgingTotals = {
  amounts: Record<AgingBucket, number>;
  counts: Record<AgingBucket, number>;
  grandTotal: number;
  overdueAmount: number;
  overdueCount: number;
  rows: Array<AgingDocument & { agingDate: string; daysPastDue: number; bucket: AgingBucket }>;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export { roundMoney as roundDashboardMoney };

export function padIsoPart(n: number): string {
  return String(n).padStart(2, '0');
}

export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${padIsoPart(dt.getUTCMonth() + 1)}-${padIsoPart(dt.getUTCDate())}`;
}

export function inclusiveDayCount(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

export function previousEquivalentRange(from: string, to: string): { from: string; to: string } {
  const days = Math.max(1, inclusiveDayCount(from, to));
  const prevTo = addDaysIso(from, -1);
  const prevFrom = addDaysIso(prevTo, -(days - 1));
  return { from: prevFrom, to: prevTo };
}

export function seriesGrainForRange(from: string, to: string): SeriesGrain {
  const days = inclusiveDayCount(from, to);
  if (days <= MAX_DAY_BUCKETS) return 'day';
  if (days <= MAX_DAY_BUCKETS * 7 && days / 7 <= MAX_WEEK_BUCKETS) return 'week';
  return 'month';
}

export function calendarDateInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) return now.toISOString().slice(0, 10);
  return `${y}-${m}-${d}`;
}

export function formatCompanyMoney(
  value: number,
  currency: string,
  opts?: { compact?: boolean },
): string {
  const code = (currency || 'XXX').trim().toUpperCase() || 'XXX';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(Number.isFinite(value) ? value : 0);
  if (opts?.compact && abs >= 1_000_000) return `${sign}${code} ${(abs / 1_000_000).toFixed(2)}M`;
  if (opts?.compact && abs >= 1_000) return `${sign}${code} ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${code} ${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function comparisonChange(current: number, previous: number | null | undefined): ComparisonChange {
  if (previous == null || !Number.isFinite(previous)) {
    return { kind: 'missing', pct: null, label: 'No baseline' };
  }
  if (previous === 0 && current === 0) {
    return { kind: 'zero-baseline', pct: 0, label: 'No change from a zero baseline' };
  }
  if (previous === 0) {
    return { kind: 'new', pct: null, label: 'No comparable baseline' };
  }
  const pct = roundMoney(((current - previous) / Math.abs(previous)) * 100);
  if (!Number.isFinite(pct)) {
    return { kind: 'missing', pct: null, label: 'No baseline' };
  }
  const arrow = pct > 0 ? '+' : '';
  return { kind: 'pct', pct, label: `${arrow}${pct.toFixed(1)}% vs previous` };
}

export function inDateWindow(date: string, from: string | null, to: string | null): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function activeLines(lines: DashboardJournalLine[]): DashboardJournalLine[] {
  return lines.filter((line) => !line.voided && Number.isFinite(Number(line.amount)));
}

export function rowsFromLines(
  lines: DashboardJournalLine[],
  names?: Record<string, { name: string; type: string }>,
): StatementRow[] {
  const acc = new Map<string, { debit: number; credit: number; type: string; name: string }>();
  for (const line of activeLines(lines)) {
    const meta = names?.[line.accountCode];
    const cur = acc.get(line.accountCode) ?? {
      debit: 0,
      credit: 0,
      type: line.accountType || meta?.type || 'asset',
      name: line.accountName || meta?.name || line.accountCode,
    };
    const amount = Number(line.amount);
    if (line.side === 'debit') cur.debit += amount;
    else if (line.side === 'credit') cur.credit += amount;
    acc.set(line.accountCode, cur);
  }
  return [...acc.entries()].map(([code, row]) => ({
    accountCode: code,
    accountName: row.name,
    type: row.type,
    debit: roundMoney(row.debit),
    credit: roundMoney(row.credit),
    balance: signedAccountBalance(row.type, row.debit, row.credit),
  }));
}

export function balanceFor(rows: StatementRow[], code: string): number {
  return roundMoney(rows.filter((row) => row.accountCode === code).reduce((sum, row) => sum + row.balance, 0));
}

export function netSalesFromRows(rows: StatementRow[]): number {
  return roundMoney(
    NET_SALES_CODES.reduce((sum, code) => sum + balanceFor(rows, code), 0),
  );
}

export function operatingResultFromRows(rows: StatementRow[]): number {
  const revenue = rows.filter((row) => row.type === 'revenue').reduce((sum, row) => sum + row.balance, 0);
  const expense = rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.balance, 0);
  return roundMoney(revenue - expense);
}

export function spendableCashFromRows(rows: StatementRow[]): number {
  return roundMoney(
    rows.filter((row) => isSpendableCashCode(row.accountCode)).reduce((sum, row) => sum + row.balance, 0),
  );
}

export function cardClearingFromRows(rows: StatementRow[]): number {
  return roundMoney(
    rows.filter((row) => isCardClearingCode(row.accountCode)).reduce((sum, row) => sum + row.balance, 0),
  );
}

export function cashUniverseFromRows(rows: StatementRow[]): number {
  return roundMoney(
    rows.filter((row) => isCashUniverseCode(row.accountCode)).reduce((sum, row) => sum + row.balance, 0),
  );
}

export function classifyCashJournal(
  lines: Array<{ accountCode: string; side: string; amount: number }>,
): CashClassification {
  const cashHas = (code: string) => isCashUniverseCode(code);
  const funding = new Set<string>(FUNDING_ACCOUNT_CODES);
  const nonZero = lines.filter((line) => Number(line.amount) !== 0);
  const cashLines = nonZero.filter((line) => cashHas(line.accountCode));
  const other = nonZero.filter((line) => !cashHas(line.accountCode));
  if (cashLines.length >= 2 && other.length === 0) {
    const hasDebit = cashLines.some((line) => line.side === 'debit');
    const hasCredit = cashLines.some((line) => line.side === 'credit');
    if (hasDebit && hasCredit) return 'internal_transfer';
  }
  if (other.some((line) => funding.has(line.accountCode))) return 'funding';
  return 'operating';
}

export type ExternalCashFlow = {
  moneyIn: number;
  moneyOut: number;
  net: number;
  transferIn: number;
  transferOut: number;
  fundingIn: number;
  fundingOut: number;
  operatingIn: number;
  operatingOut: number;
  lineCount: number;
};

export function externalCashFlow(lines: DashboardJournalLine[]): ExternalCashFlow {
  const cashHas = (code: string) => isCashUniverseCode(code);
  const byJournal = new Map<string, DashboardJournalLine[]>();
  for (const line of activeLines(lines)) {
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
  let operatingIn = 0;
  let operatingOut = 0;
  let lineCount = 0;
  for (const journalLines of byJournal.values()) {
    const kind = classifyCashJournal(journalLines);
    for (const line of journalLines) {
      if (!cashHas(line.accountCode)) continue;
      const amount = Number(line.amount);
      if (!Number.isFinite(amount) || amount === 0) continue;
      lineCount += 1;
      if (line.side === 'debit') {
        if (kind === 'internal_transfer') transferIn += amount;
        else {
          moneyIn += amount;
          if (kind === 'funding') fundingIn += amount;
          else operatingIn += amount;
        }
      } else if (line.side === 'credit') {
        if (kind === 'internal_transfer') transferOut += amount;
        else {
          moneyOut += amount;
          if (kind === 'funding') fundingOut += amount;
          else operatingOut += amount;
        }
      }
    }
  }
  return {
    moneyIn: roundMoney(moneyIn),
    moneyOut: roundMoney(moneyOut),
    net: roundMoney(moneyIn - moneyOut),
    transferIn: roundMoney(transferIn),
    transferOut: roundMoney(transferOut),
    fundingIn: roundMoney(fundingIn),
    fundingOut: roundMoney(fundingOut),
    operatingIn: roundMoney(operatingIn),
    operatingOut: roundMoney(operatingOut),
    lineCount,
  };
}

export function cashReconciliation(opening: number, movement: number, closing: number): {
  opening: number;
  movement: number;
  closing: number;
  expectedClosing: number;
  difference: number;
} {
  const expectedClosing = roundMoney(opening + movement);
  return {
    opening: roundMoney(opening),
    movement: roundMoney(movement),
    closing: roundMoney(closing),
    expectedClosing,
    difference: roundMoney(closing - expectedClosing),
  };
}

function agingBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return 'd1_30';
  if (daysPastDue <= 60) return 'd31_60';
  if (daysPastDue <= 90) return 'd61_90';
  return 'd90_plus';
}

export function agingFromDocuments(items: AgingDocument[], asOf: string): AgingTotals {
  const asOfMs = Date.parse(`${asOf}T12:00:00`);
  const empty = (): Record<AgingBucket, number> => ({
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90_plus: 0,
  });
  const amounts = empty();
  const counts = empty();
  const rows = items
    .map((item) => {
      const remaining = roundMoney(Number(item.balanceDue) + Number(item.laterSettlements ?? 0));
      const agingDate = item.dueDate || item.issueDate;
      const daysPastDue = Math.floor((asOfMs - Date.parse(`${agingDate}T12:00:00`)) / 86400000);
      return {
        ...item,
        balanceDue: remaining,
        agingDate,
        daysPastDue,
        bucket: agingBucket(daysPastDue),
      };
    })
    .filter((row) => row.balanceDue > 0.005);
  rows.sort((a, b) => b.daysPastDue - a.daysPastDue || a.partyName.localeCompare(b.partyName));
  for (const row of rows) {
    amounts[row.bucket] = roundMoney(amounts[row.bucket] + row.balanceDue);
    counts[row.bucket] += 1;
  }
  const grandTotal = roundMoney(Object.values(amounts).reduce((sum, n) => sum + n, 0));
  const overdueAmount = roundMoney(grandTotal - amounts.current);
  const overdueCount = rows.filter((row) => row.bucket !== 'current').length;
  return { amounts, counts, grandTotal, overdueAmount, overdueCount, rows };
}

export function rankExpenses(rows: StatementRow[], topN = 5): { items: RankedExpense[]; total: number } {
  const ranked = rows
    .filter((row) => row.type === 'expense' && Math.abs(row.balance) >= 0.005)
    .map((row) => ({ code: row.accountCode, name: row.accountName, amount: roundMoney(row.balance) }))
    .sort((a, b) => b.amount - a.amount);
  const total = roundMoney(ranked.reduce((sum, row) => sum + row.amount, 0));
  if (ranked.length <= topN) return { items: ranked, total };
  const top = ranked.slice(0, topN);
  const other = roundMoney(ranked.slice(topN).reduce((sum, row) => sum + row.amount, 0));
  return {
    items: [...top, { code: 'other', name: 'Other', amount: other }],
    total,
  };
}

function bucketKey(date: string, grain: SeriesGrain): { key: string; from: string; to: string; label: string } {
  if (grain === 'day') {
    return { key: date, from: date, to: date, label: date.slice(8) + '/' + date.slice(5, 7) };
  }
  if (grain === 'week') {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const from = addDaysIso(date, -((day + 6) % 7));
    const to = addDaysIso(from, 6);
    return { key: from, from, to, label: `${from.slice(8)}/${from.slice(5, 7)}` };
  }
  const from = `${date.slice(0, 7)}-01`;
  const to = addDaysIso(addDaysIso(from, 32).slice(0, 7) + '-01', -1);
  return { key: date.slice(0, 7), from, to, label: date.slice(0, 7) };
}

export function enumerateBuckets(from: string, to: string, grain: SeriesGrain): Array<{
  key: string;
  from: string;
  to: string;
  label: string;
}> {
  const out: Array<{ key: string; from: string; to: string; label: string }> = [];
  const seen = new Set<string>();
  let cursor = from;
  while (cursor <= to) {
    const bucket = bucketKey(cursor, grain);
    const clipped = {
      key: bucket.key,
      from: bucket.from < from ? from : bucket.from,
      to: bucket.to > to ? to : bucket.to,
      label: bucket.label,
    };
    if (!seen.has(clipped.key)) {
      seen.add(clipped.key);
      out.push(clipped);
    }
    cursor = addDaysIso(clipped.to, 1);
    if (out.length > 400) break;
  }
  return out;
}

export function salesSeries(
  lines: DashboardJournalLine[],
  from: string,
  to: string,
  grain: SeriesGrain,
): SeriesPoint[] {
  const buckets = enumerateBuckets(from, to, grain);
  const totals = new Map<string, number>();
  for (const line of activeLines(lines)) {
    if (!NET_SALES_CODES.includes(line.accountCode as (typeof NET_SALES_CODES)[number])) continue;
    if (!inDateWindow(line.date, from, to)) continue;
    const bucket = bucketKey(line.date, grain);
    const signed = signedAccountBalance('revenue', line.side === 'debit' ? Number(line.amount) : 0, line.side === 'credit' ? Number(line.amount) : 0);
    totals.set(bucket.key, roundMoney((totals.get(bucket.key) ?? 0) + signed));
  }
  return buckets.map((bucket) => ({
    ...bucket,
    value: roundMoney(totals.get(bucket.key) ?? 0),
  }));
}

export function cashSeries(
  lines: DashboardJournalLine[],
  from: string,
  to: string,
  grain: SeriesGrain,
): CashSeriesPoint[] {
  const buckets = enumerateBuckets(from, to, grain);
  const byJournal = new Map<string, DashboardJournalLine[]>();
  for (const line of activeLines(lines)) {
    if (!inDateWindow(line.date, from, to)) continue;
    const list = byJournal.get(line.journalId) ?? [];
    list.push(line);
    byJournal.set(line.journalId, list);
  }
  const totals = new Map<string, { moneyIn: number; moneyOut: number }>();
  for (const journalLines of byJournal.values()) {
    const kind = classifyCashJournal(journalLines);
    if (kind === 'internal_transfer') continue;
    const date = journalLines[0]?.date;
    if (!date) continue;
    const bucket = bucketKey(date, grain);
    const cur = totals.get(bucket.key) ?? { moneyIn: 0, moneyOut: 0 };
    for (const line of journalLines) {
      if (!isCashUniverseCode(line.accountCode)) continue;
      const amount = Number(line.amount);
      if (!Number.isFinite(amount) || amount === 0) continue;
      if (line.side === 'debit') cur.moneyIn += amount;
      else if (line.side === 'credit') cur.moneyOut += amount;
    }
    totals.set(bucket.key, cur);
  }
  return buckets.map((bucket) => {
    const cur = totals.get(bucket.key) ?? { moneyIn: 0, moneyOut: 0 };
    const moneyIn = roundMoney(cur.moneyIn);
    const moneyOut = roundMoney(cur.moneyOut);
    return {
      ...bucket,
      moneyIn,
      moneyOut,
      value: roundMoney(moneyIn - moneyOut),
    };
  });
}

export function withPreviousSeries(current: SeriesPoint[], previous: SeriesPoint[]): SeriesPoint[] {
  return current.map((point, index) => ({
    ...point,
    previous: previous[index] ? previous[index]!.value : null,
  }));
}

export function withPreviousCashSeries(current: CashSeriesPoint[], previous: CashSeriesPoint[]): CashSeriesPoint[] {
  return current.map((point, index) => ({
    ...point,
    previous: previous[index] ? previous[index]!.value : null,
    previousIn: previous[index] ? previous[index]!.moneyIn : null,
    previousOut: previous[index] ? previous[index]!.moneyOut : null,
  }));
}

export type DashboardMetricsSnapshot = {
  netSales: number;
  operatingResult: number;
  netCashMovement: number;
  cashAndBank: number;
  cardClearing: number;
  receivables: number;
  payables: number;
  externalCash: ExternalCashFlow;
  cashReconcile: ReturnType<typeof cashReconciliation>;
  expenses: { items: RankedExpense[]; total: number };
  arAging: AgingTotals;
  apAging: AgingTotals;
  arControlDifference: number;
  apControlDifference: number;
};

export function composeDashboardMetrics(input: {
  periodLines: DashboardJournalLine[];
  asOfLines: DashboardJournalLine[];
  openingCashUniverse: number;
  arDocuments?: AgingDocument[];
  apDocuments?: AgingDocument[];
  asOf: string;
}): DashboardMetricsSnapshot {
  const periodRows = rowsFromLines(input.periodLines);
  const asOfRows = rowsFromLines(input.asOfLines);
  const netSales = netSalesFromRows(periodRows);
  const operatingResult = operatingResultFromRows(periodRows);
  const cashAndBank = spendableCashFromRows(asOfRows);
  const cardClearing = cardClearingFromRows(asOfRows);
  const closingUniverse = cashUniverseFromRows(asOfRows);
  const externalCash = externalCashFlow(input.periodLines);
  const universeFlow = signedCashFlow(activeLines(input.periodLines));
  const netCashMovement = universeFlow.net;
  const cashReconcile = cashReconciliation(input.openingCashUniverse, netCashMovement, closingUniverse);
  const receivables = balanceFor(asOfRows, RECEIVABLE_CODE);
  const payables = balanceFor(asOfRows, PAYABLE_CODE);
  const arAging = agingFromDocuments(input.arDocuments ?? [], input.asOf);
  const apAging = agingFromDocuments(input.apDocuments ?? [], input.asOf);
  return {
    netSales,
    operatingResult,
    netCashMovement,
    cashAndBank,
    cardClearing,
    receivables,
    payables,
    externalCash,
    cashReconcile,
    expenses: rankExpenses(periodRows),
    arAging,
    apAging,
    arControlDifference: roundMoney(arAging.grandTotal - receivables),
    apControlDifference: roundMoney(apAging.grandTotal - payables),
  };
}
