'use server';

import {
  db,
  accounts,
  journalEntries,
  journalLines,
  transactions,
  bankStatementLines,
  periodLocks,
  withTenantContext,
  eq,
  and,
  isNull,
  desc,
  asc,
  gte,
  lte,
  inArray,
  sql,
} from '@bookone/db';
import { requireTenantContext } from '@bookone/auth';

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface AccountBalance {
  id: string;
  code: string;
  name: string;
  type: string;
  normalSide: string;
  balance: number; // positive for assets/expenses, negative for liabilities/equity/revenue
}

export interface DashboardMetric {
  label: string;
  value: string;
  note: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export interface DashboardData {
  tenant: TenantInfo;
  user: { id: string; name: string; email: string };
  metrics: DashboardMetric[];
  recentTransactions: {
    id: string;
    date: string;
    party: string;
    description: string;
    direction: string;
    type: string;
    amount: number;
    currency: string;
  }[];
  lowConfidenceCount: number;
  availablePeriods: string[]; // e.g. ["2026-06", "2026-05"]
  selectedPeriod: string | null;
  cashFlow: {
    moneyIn: number;
    moneyOut: number;
    net: number;
    transactionCount: number;
  };
}

export interface PeriodOptions {
  selected: string | null;
  available: string[];
}

/** Returns the current tenant + user info for the topbar. */
export async function getTenantInfo(): Promise<TenantInfo> {
  const user = await requireTenantContext();
  const { tenants } = await import('@bookone/db');
  const [t] = await db()
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);
  if (!t) throw new Error('Tenant not found.');
  return t;
}

/**
 * Computes the current account balances for the tenant by aggregating
 * signed journal line amounts. Uses each account's normalSide to determine
 * whether debits or credits increase the balance.
 */
async function computeAccountBalances(tenantId: string, period?: string | null): Promise<AccountBalance[]> {
  const selectedPeriod = normalizePeriod(period ?? undefined);
  return withTenantContext(tenantId, async () => {
    const journalJoinConditions = [
      eq(journalEntries.id, journalLines.journalEntryId),
      isNull(journalEntries.voidedAt),
    ];
    if (selectedPeriod) {
      journalJoinConditions.push(gte(journalEntries.entryDate, `${selectedPeriod}-01`));
      journalJoinConditions.push(lte(journalEntries.entryDate, `${selectedPeriod}-31`));
    }

    // Sum debits - credits per account, then adjust for normalSide.
    const rows = await db()
      .select({
        id: accounts.id,
        code: accounts.code,
        name: accounts.name,
        type: accounts.type,
        normalSide: accounts.normalSide,
        debitTotal: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.id} IS NOT NULL AND ${journalLines.side} = 'debit' THEN ${journalLines.amount}::numeric ELSE 0 END), 0)`,
        creditTotal: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.id} IS NOT NULL AND ${journalLines.side} = 'credit' THEN ${journalLines.amount}::numeric ELSE 0 END), 0)`,
      })
      .from(accounts)
      .leftJoin(journalLines, and(eq(journalLines.accountId, accounts.id), isNull(journalLines.voidedAt)))
      .leftJoin(journalEntries, and(...journalJoinConditions))
      .where(and(eq(accounts.tenantId, tenantId), isNull(accounts.voidedAt)))
      .groupBy(accounts.id);

    return rows.map((r) => {
      const debit = parseFloat(r.debitTotal);
      const credit = parseFloat(r.creditTotal);
      // For debit-normal accounts: balance = debit - credit
      // For credit-normal accounts: balance = credit - debit
      const raw = r.normalSide === 'debit' ? debit - credit : credit - debit;
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        type: r.type,
        normalSide: r.normalSide,
        balance: Number.isFinite(raw) ? raw : 0,
      };
    });
  });
}

function formatLKR(value: number, compact = false): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (compact && abs >= 1_000_000) return `${sign}LKR ${(abs / 1_000_000).toFixed(2)}M`;
  if (compact && abs >= 1_000) return `${sign}LKR ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function normalizePeriod(period?: string): string | null {
  if (!period || period === 'all') return null;
  return /^\d{4}-\d{2}$/.test(period) ? period : null;
}

function selectedPeriodFromInput(period?: string): string | null {
  if (period === 'all') return null;
  return normalizePeriod(period) ?? currentPeriod();
}

async function collectAvailablePeriods(tenantId: string, selectedPeriod: string | null): Promise<string[]> {
  const monthRows = await db()
    .select({ date: transactions.date })
    .from(transactions)
    .where(and(eq(transactions.tenantId, tenantId), isNull(transactions.voidedAt)));

  const periodSet = new Set<string>([currentPeriod()]);
  if (selectedPeriod) periodSet.add(selectedPeriod);
  for (const r of monthRows) {
    if (r.date && /^\d{4}-\d{2}/.test(r.date)) {
      periodSet.add(r.date.slice(0, 7));
    }
  }

  return Array.from(periodSet).sort().reverse();
}

export async function getPeriodOptions(period?: string): Promise<PeriodOptions> {
  const user = await requireTenantContext();
  const selected = selectedPeriodFromInput(period);
  return withTenantContext(user.tenantId, async () => ({
    selected,
    available: await collectAvailablePeriods(user.tenantId, selected),
  }));
}

export async function getDashboardData(period?: string): Promise<DashboardData> {
  const user = await requireTenantContext();
  const tenant = await getTenantInfo();
  const selectedPeriod = selectedPeriodFromInput(period);

  return withTenantContext(user.tenantId, async () => {
    const balances = await computeAccountBalances(user.tenantId, selectedPeriod);

    const find = (code: string) => balances.find((b) => b.code === code)?.balance ?? 0;

    const cash = find('1000') + find('1100') + find('1200'); // Cash on Hand + Bank + Card Clearing
    const receivable = find('1300');
    const payable = find('2100');
    const revenue = balances
      .filter((b) => b.type === 'revenue')
      .reduce((sum, b) => sum + b.balance, 0);
    const expense = balances
      .filter((b) => b.type === 'expense')
      .reduce((sum, b) => sum + b.balance, 0);
    const net = revenue - expense;

    const metrics: DashboardMetric[] = [
      {
        label: 'Net position',
        value: formatLKR(net, true),
        note: net >= 0 ? 'Revenue exceeds expenses' : 'Expenses exceed revenue',
        tone: net >= 0 ? 'success' : 'danger',
      },
      {
        label: 'Cash available',
        value: formatLKR(cash, true),
        note: 'Cash on hand + bank + card',
        tone: 'neutral',
      },
      {
        label: 'Receivables',
        value: formatLKR(receivable, true),
        note: 'Open customer balances',
        tone: receivable > 0 ? 'warning' : 'neutral',
      },
      {
        label: 'Payables',
        value: formatLKR(payable, true),
        note: 'Supplier balances owed',
        tone: payable > 0 ? 'info' : 'neutral',
      },
    ];

    // Recent transactions (last 10)
    const transactionConditions = [eq(transactions.tenantId, user.tenantId), isNull(transactions.voidedAt)];
    if (selectedPeriod) {
      transactionConditions.push(gte(transactions.date, `${selectedPeriod}-01`));
      transactionConditions.push(lte(transactions.date, `${selectedPeriod}-31`));
    }

    const periodTransactions = await db()
      .select({
        direction: transactions.direction,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(and(...transactionConditions));

    const moneyIn = periodTransactions
      .filter((tx) => tx.direction === 'money_in')
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const moneyOut = periodTransactions
      .filter((tx) => tx.direction === 'money_out')
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const netCashFlow = moneyIn - moneyOut;

    const recent = await db()
      .select({
        id: transactions.id,
        date: transactions.date,
        party: transactions.party,
        description: transactions.description,
        direction: transactions.direction,
        type: transactions.accountingType,
        amount: transactions.amount,
        currency: transactions.currency,
      })
      .from(transactions)
      .where(and(...transactionConditions))
      .orderBy(desc(transactions.createdAt))
      .limit(10);

    // Count low-confidence categories needing review
    const lowConfidenceConditions = [
      eq(transactions.tenantId, user.tenantId),
      isNull(transactions.voidedAt),
      sql`${transactions.categoryConfidence} IS NOT NULL AND ${transactions.categoryConfidence}::numeric < 0.7`,
    ];
    if (selectedPeriod) {
      lowConfidenceConditions.push(gte(transactions.date, `${selectedPeriod}-01`));
      lowConfidenceConditions.push(lte(transactions.date, `${selectedPeriod}-31`));
    }

    const [{ count: lowConfidenceCount }] = await db()
      .select({ count: sql<number>`COUNT(*)` })
      .from(transactions)
      .where(and(...lowConfidenceConditions));

    const availablePeriods = await collectAvailablePeriods(user.tenantId, selectedPeriod);

    metrics.splice(1, 0, {
      label: 'Net cash flow',
      value: formatLKR(netCashFlow, true),
      note: `${periodTransactions.length} posted entries in view`,
      tone: netCashFlow >= 0 ? 'success' : 'danger',
    });
    metrics.push(
      {
        label: 'Money in',
        value: formatLKR(moneyIn, true),
        note: 'Cash received in this view',
        tone: 'success',
      },
      {
        label: 'Money out',
        value: formatLKR(moneyOut, true),
        note: 'Cash paid out in this view',
        tone: moneyOut > 0 ? 'warning' : 'neutral',
      },
    );

    return {
      tenant,
      user: { id: user.id, name: user.name ?? user.email, email: user.email },
      metrics,
      recentTransactions: recent.map((r) => ({
        id: r.id,
        date: r.date,
        party: r.party,
        description: r.description,
        direction: r.direction,
        type: r.type,
        amount: parseFloat(r.amount),
        currency: r.currency,
      })),
      lowConfidenceCount: Number(lowConfidenceCount) || 0,
      availablePeriods,
      selectedPeriod,
      cashFlow: {
        moneyIn,
        moneyOut,
        net: netCashFlow,
        transactionCount: periodTransactions.length,
      },
    };
  });
}

export interface TransactionRow {
  id: string;
  date: string;
  party: string;
  description: string;
  direction: string;
  accountingType: string;
  amount: number;
  currency: string;
  categoryName: string | null;
  categoryConfidence: number | null;
  categorySource: string | null;
  receiptRef: string | null;
  paymentAccountCode: string;
  paymentAccountName: string;
  reconciliationStatus: string | null;
  reconciliationLineId: string | null;
  isPeriodLocked: boolean;
  reversedByTransactionId: string | null;
  reversesTransactionId: string | null;
}

export interface TransactionFilters {
  period?: string;
  q?: string;
  confidence?: 'low' | 'all';
  receipt?: 'missing' | 'attached' | 'all';
  reconciliation?: 'reconciled' | 'unreconciled' | 'all';
  account?: string;
  party?: string;
}

function filtersFromInput(input?: string | TransactionFilters): TransactionFilters {
  return typeof input === 'string' ? { period: input } : input ?? {};
}

export async function isPeriodLocked(tenantId: string, period: string): Promise<boolean> {
  return withTenantContext(tenantId, async () => {
    const [lock] = await db()
      .select({ id: periodLocks.id })
      .from(periodLocks)
      .where(
        and(
          eq(periodLocks.tenantId, tenantId),
          eq(periodLocks.period, period),
          eq(periodLocks.status, 'locked'),
          isNull(periodLocks.voidedAt),
        ),
      )
      .limit(1);
    return Boolean(lock);
  });
}

export async function listTransactions(input?: string | TransactionFilters): Promise<TransactionRow[]> {
  const user = await requireTenantContext();
  const filters = filtersFromInput(input);
  const selectedPeriod = selectedPeriodFromInput(filters.period);
  return withTenantContext(user.tenantId, async () => {
    const conditions = [eq(transactions.tenantId, user.tenantId), isNull(transactions.voidedAt)];
    if (selectedPeriod) {
      conditions.push(gte(transactions.date, `${selectedPeriod}-01`));
      conditions.push(lte(transactions.date, `${selectedPeriod}-31`));
    }
    const rows = await db()
      .select({
        id: transactions.id,
        date: transactions.date,
        party: transactions.party,
        description: transactions.description,
        direction: transactions.direction,
        accountingType: transactions.accountingType,
        amount: transactions.amount,
        currency: transactions.currency,
        categoryName: transactions.categoryName,
        categoryConfidence: transactions.categoryConfidence,
        categorySource: transactions.categorySource,
        receiptRef: transactions.receiptRef,
        paymentAccountCode: accounts.code,
        paymentAccountName: accounts.name,
        reversedByTransactionId: transactions.reversedByTransactionId,
        reversesTransactionId: transactions.reversesTransactionId,
      })
      .from(transactions)
      .leftJoin(accounts, eq(accounts.id, transactions.paymentAccountId))
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.createdAt));
    const transactionIds = rows.map((r) => r.id);
    const reconciliationRows =
      transactionIds.length === 0
        ? []
        : await db()
            .select({
              id: bankStatementLines.id,
              matchedTransactionId: bankStatementLines.matchedTransactionId,
              status: bankStatementLines.status,
            })
            .from(bankStatementLines)
            .where(
              and(
                eq(bankStatementLines.tenantId, user.tenantId),
                isNull(bankStatementLines.voidedAt),
                inArray(bankStatementLines.matchedTransactionId, transactionIds),
              ),
            );
    const reconciliationByTx = new Map<string, { id: string; status: string }>();
    for (const row of reconciliationRows) {
      if (row.matchedTransactionId) {
        reconciliationByTx.set(row.matchedTransactionId, { id: row.id, status: row.status });
      }
    }

    const lockRows = await db()
      .select({ period: periodLocks.period })
      .from(periodLocks)
      .where(
        and(
          eq(periodLocks.tenantId, user.tenantId),
          eq(periodLocks.status, 'locked'),
          isNull(periodLocks.voidedAt),
        ),
      );
    const lockedPeriods = new Set(lockRows.map((row) => row.period));

    const mapped = rows.map((r) => {
      const reconciliation = reconciliationByTx.get(r.id);
      return {
      id: r.id,
      date: r.date,
      party: r.party,
      description: r.description,
      direction: r.direction,
      accountingType: r.accountingType,
      amount: parseFloat(r.amount),
      currency: r.currency,
      categoryName: r.categoryName,
      categoryConfidence: r.categoryConfidence ? parseFloat(r.categoryConfidence) : null,
      categorySource: r.categorySource,
      receiptRef: r.receiptRef,
      paymentAccountCode: r.paymentAccountCode ?? '',
      paymentAccountName: r.paymentAccountName ?? '',
      reconciliationStatus: reconciliation?.status ?? null,
      reconciliationLineId: reconciliation?.id ?? null,
      isPeriodLocked: lockedPeriods.has(r.date.slice(0, 7)),
      reversedByTransactionId: r.reversedByTransactionId,
      reversesTransactionId: r.reversesTransactionId,
      };
    });

    return mapped.filter((tx) => {
      const q = filters.q?.trim().toLowerCase();
      if (q && !`${tx.party} ${tx.description} ${tx.categoryName ?? ''}`.toLowerCase().includes(q)) return false;
      if (filters.party?.trim() && !tx.party.toLowerCase().includes(filters.party.trim().toLowerCase())) return false;
      if (filters.account?.trim() && tx.paymentAccountCode !== filters.account.trim()) return false;
      if (filters.confidence === 'low' && (tx.categoryConfidence == null || tx.categoryConfidence >= 0.7)) return false;
      if (filters.receipt === 'missing' && tx.receiptRef) return false;
      if (filters.receipt === 'attached' && !tx.receiptRef) return false;
      if (filters.reconciliation === 'reconciled' && !tx.reconciliationStatus) return false;
      if (filters.reconciliation === 'unreconciled' && tx.reconciliationStatus) return false;
      return true;
    });
  });
}

export interface JournalEntryRow {
  id: string;
  transactionId: string;
  memo: string;
  entryDate: string;
  date: string;
  party: string;
  description: string;
  direction: string;
  amount: number;
  currency: string;
  lines: {
    id: string;
    accountCode: string;
    accountName: string;
    side: 'debit' | 'credit';
    amount: number;
    memo: string | null;
  }[];
}

export async function listJournalEntries(period?: string): Promise<JournalEntryRow[]> {
  const user = await requireTenantContext();
  const selectedPeriod = selectedPeriodFromInput(period);
  return withTenantContext(user.tenantId, async () => {
    const conditions = [eq(journalEntries.tenantId, user.tenantId), isNull(journalEntries.voidedAt)];
    if (selectedPeriod) {
      conditions.push(gte(journalEntries.entryDate, `${selectedPeriod}-01`));
      conditions.push(lte(journalEntries.entryDate, `${selectedPeriod}-31`));
    }
    const entries = await db()
      .select({
        id: journalEntries.id,
        transactionId: journalEntries.transactionId,
        memo: journalEntries.memo,
        entryDate: journalEntries.entryDate,
        txDate: transactions.date,
        party: transactions.party,
        description: transactions.description,
        direction: transactions.direction,
        amount: transactions.amount,
        currency: transactions.currency,
      })
      .from(journalEntries)
      .innerJoin(transactions, eq(transactions.id, journalEntries.transactionId))
      .where(and(...conditions))
      .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt));

    // Fetch all lines for these entries in one go
    const entryIds = entries.map((e) => e.id);
    const lines =
      entryIds.length === 0
        ? []
        : await db()
            .select({
              id: journalLines.id,
              journalEntryId: journalLines.journalEntryId,
              side: journalLines.side,
              amount: journalLines.amount,
              memo: journalLines.memo,
              accountCode: accounts.code,
              accountName: accounts.name,
            })
            .from(journalLines)
            .leftJoin(accounts, eq(accounts.id, journalLines.accountId))
            .where(
              and(
                eq(journalLines.tenantId, user.tenantId),
                isNull(journalLines.voidedAt),
                inArray(journalLines.journalEntryId, entryIds),
              ),
            )
            .orderBy(asc(journalLines.createdAt));

    const linesByEntry = new Map<string, JournalEntryRow['lines']>();
    for (const ln of lines) {
      if (!ln.journalEntryId) continue;
      const arr = linesByEntry.get(ln.journalEntryId) ?? [];
      arr.push({
        id: ln.id,
        accountCode: ln.accountCode ?? '',
        accountName: ln.accountName ?? '',
        side: ln.side as 'debit' | 'credit',
        amount: parseFloat(ln.amount),
        memo: ln.memo,
      });
      linesByEntry.set(ln.journalEntryId, arr);
    }

    return entries.map((e) => ({
      id: e.id,
      transactionId: e.transactionId,
      memo: e.memo,
      entryDate: e.entryDate,
      date: e.txDate,
      party: e.party,
      description: e.description,
      direction: e.direction,
      amount: parseFloat(e.amount),
      currency: e.currency,
      lines: linesByEntry.get(e.id) ?? [],
    }));
  });
}

export interface ReportRow {
  accountCode: string;
  accountName: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface ReportsData {
  trialBalance: ReportRow[];
  income: { revenue: ReportRow[]; expense: ReportRow[]; netIncome: number };
  asOfPeriod: string;
}

export async function getReports(period?: string): Promise<ReportsData> {
  const user = await requireTenantContext();
  const selectedPeriod = selectedPeriodFromInput(period);
  const balances = await computeAccountBalances(user.tenantId, selectedPeriod);
  const trialBalance: ReportRow[] = balances.map((b) => ({
    accountCode: b.code,
    accountName: b.name,
    type: b.type,
    debit: b.normalSide === 'debit' ? Math.max(0, b.balance) : 0,
    credit: b.normalSide === 'credit' ? Math.max(0, b.balance) : 0,
    balance: b.balance,
  }));

  const revenue = trialBalance.filter((r) => r.type === 'revenue');
  const expense = trialBalance.filter((r) => r.type === 'expense');
  const netIncome = revenue.reduce((s, r) => s + r.balance, 0) - expense.reduce((s, r) => s + r.balance, 0);

  return {
    trialBalance,
    income: { revenue, expense, netIncome },
    asOfPeriod: selectedPeriod ?? 'all',
  };
}

export interface AccountWithBalance {
  id: string;
  code: string;
  name: string;
  type: string;
  normalSide: string;
  balance: number;
}

export async function listAccountsWithBalances(): Promise<AccountWithBalance[]> {
  const user = await requireTenantContext();
  return computeAccountBalances(user.tenantId);
}
