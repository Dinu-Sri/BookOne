'use server';

import {
  comparativeRange,
  profitFrom,
  statementOfCashFlows,
  statementOfChangesInEquity,
  statementOfFinancialPosition,
  statementOfProfitOrLoss,
  isCashAccount,
  type CashJournalLine,
  type Statement,
  type StatementAccount,
} from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  and,
  companyProfiles,
  db,
  eq,
  gte,
  isNull,
  journalEntries,
  journalLines,
  lte,
  sql,
  taxProfiles,
  withTenantContext,
} from '@bookone/db';
import { assertPermission } from '@/lib/access';
import { normalizePeriodToken, resolvePeriodBounds } from '@/lib/period-range';

export type FinancialStatementsPack = {
  company: { name: string; address: string; registration: string; tin: string };
  period: { token: string; label: string; from: string | null; to: string | null };
  compare: { from: string; to: string; label: string } | null;
  currency: 'LKR';
  generatedAt: string;
  profitOrLoss: Statement;
  financialPosition: Statement;
  cashFlows: Statement;
  changesInEquity: Statement;
  /** Small series for charts: profit or loss headline figures. */
  headline: {
    revenue: number;
    grossProfit: number;
    profit: number;
    totalAssets: number;
    totalLiabilities: number;
    equity: number;
    cash: number;
    revenueCompare: number | null;
    profitCompare: number | null;
  };
};

function dayBefore(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function longDate(iso: string | null) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Account debit and credit totals for posted journals between from and to (either may be open). */
async function accountTotals(tenantId: string, from: string | null, to: string | null): Promise<StatementAccount[]> {
  const join = [eq(journalEntries.id, journalLines.journalEntryId), isNull(journalEntries.voidedAt)];
  if (from) join.push(gte(journalEntries.entryDate, from));
  if (to) join.push(lte(journalEntries.entryDate, to));
  const rows = await db()
    .select({
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      subtype: accounts.subtype,
      controlRole: accounts.controlRole,
      liquidity: accounts.liquidity,
      cashFlowClass: accounts.cashFlowClass,
      isGroup: accounts.isGroup,
      debit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.id} IS NOT NULL AND ${journalLines.side} = 'debit' THEN ${journalLines.amount}::numeric ELSE 0 END), 0)`,
      credit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.id} IS NOT NULL AND ${journalLines.side} = 'credit' THEN ${journalLines.amount}::numeric ELSE 0 END), 0)`,
    })
    .from(accounts)
    .leftJoin(journalLines, eq(journalLines.accountId, accounts.id))
    .leftJoin(journalEntries, and(...join))
    .where(and(eq(accounts.tenantId, tenantId), isNull(accounts.voidedAt)))
    .groupBy(accounts.id);
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    type: r.type,
    subtype: r.subtype,
    controlRole: r.controlRole,
    liquidity: r.liquidity,
    cashFlowClass: r.cashFlowClass,
    isGroup: r.isGroup === '1',
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
  }));
}

/** Every line of every posted journal in the window, with its account (for the cash flow statement). */
async function journalLinesIn(tenantId: string, from: string | null, to: string | null): Promise<CashJournalLine[]> {
  const where = [eq(journalEntries.tenantId, tenantId), isNull(journalEntries.voidedAt)];
  if (from) where.push(gte(journalEntries.entryDate, from));
  if (to) where.push(lte(journalEntries.entryDate, to));
  const rows = await db()
    .select({
      entryId: journalEntries.id,
      side: journalLines.side,
      amount: journalLines.amount,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      subtype: accounts.subtype,
      controlRole: accounts.controlRole,
      liquidity: accounts.liquidity,
      cashFlowClass: accounts.cashFlowClass,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(and(...where));
  return rows.map((r) => ({
    entryId: r.entryId,
    side: r.side === 'credit' ? 'credit' : 'debit',
    amount: Number(r.amount) || 0,
    account: {
      code: r.code,
      name: r.name,
      type: r.type,
      subtype: r.subtype,
      controlRole: r.controlRole,
      liquidity: r.liquidity,
      cashFlowClass: r.cashFlowClass,
    },
  }));
}

function cashBalance(accs: StatementAccount[]) {
  return Math.round(accs.filter((a) => !a.isGroup && isCashAccount(a)).reduce((s, a) => s + (a.debit - a.credit), 0) * 100) / 100;
}

/**
 * The four primary statements for a period, with the comparative period, in the
 * SLFRS for SMEs / LKAS 1 presentation. Read-only; needs Reports read access.
 */
export async function getFinancialStatements(periodInput?: string | null): Promise<FinancialStatementsPack> {
  await assertPermission('accounting.reports.read', 'read');
  const user = await requireTenantContext();
  const token = normalizePeriodToken(periodInput || 'this_fy');
  const bounds = resolvePeriodBounds(token);
  const cmp = comparativeRange(bounds.from, bounds.to);

  return withTenantContext(user.tenantId, async () => {
    const [periodAcc, closingAcc, openingAcc, lines, cmpPeriodAcc, cmpClosingAcc, cmpOpeningAcc, cmpLines, companyRows, taxRows] =
      await Promise.all([
        accountTotals(user.tenantId, bounds.from, bounds.to),
        accountTotals(user.tenantId, null, bounds.to),
        bounds.from ? accountTotals(user.tenantId, null, dayBefore(bounds.from)) : Promise.resolve([] as StatementAccount[]),
        journalLinesIn(user.tenantId, bounds.from, bounds.to),
        cmp ? accountTotals(user.tenantId, cmp.from, cmp.to) : Promise.resolve(null),
        cmp ? accountTotals(user.tenantId, null, cmp.to) : Promise.resolve(null),
        cmp ? accountTotals(user.tenantId, null, dayBefore(cmp.from)) : Promise.resolve(null),
        cmp ? journalLinesIn(user.tenantId, cmp.from, cmp.to) : Promise.resolve(null),
        db().select().from(companyProfiles).where(eq(companyProfiles.tenantId, user.tenantId)).limit(1),
        db().select().from(taxProfiles).where(eq(taxProfiles.tenantId, user.tenantId)).limit(1),
      ]);

    const profitOrLoss = statementOfProfitOrLoss(periodAcc, cmpPeriodAcc);
    const financialPosition = statementOfFinancialPosition(closingAcc, cmpClosingAcc);
    const cashFlows = statementOfCashFlows({
      lines,
      openingCash: cashBalance(openingAcc),
      closingCash: cashBalance(closingAcc),
      compare:
        cmp && cmpLines && cmpOpeningAcc && cmpClosingAcc
          ? { lines: cmpLines, openingCash: cashBalance(cmpOpeningAcc), closingCash: cashBalance(cmpClosingAcc) }
          : null,
    });
    const changesInEquity = statementOfChangesInEquity({
      opening: openingAcc,
      closing: closingAcc,
      periodProfit: profitFrom(periodAcc.filter((a) => !a.isGroup)),
    });

    const pick = (s: Statement, key: string) => s.lines.find((l) => l.key === key);
    const company = companyRows[0];
    return {
      company: {
        name: company?.legalName || company?.tradingName || 'Company',
        address: [company?.addressLine1, company?.addressLine2, company?.city].filter(Boolean).join(', '),
        registration: company?.registrationNumber ?? '',
        tin: taxRows[0]?.tin ?? '',
      },
      period: { token, label: bounds.label, from: bounds.from, to: bounds.to },
      compare: cmp ? { ...cmp, label: `${longDate(cmp.from)} – ${longDate(cmp.to)}` } : null,
      currency: 'LKR',
      generatedAt: new Date().toISOString(),
      profitOrLoss,
      financialPosition,
      cashFlows,
      changesInEquity,
      headline: {
        revenue: pick(profitOrLoss, 'revenue')?.amount ?? 0,
        grossProfit: pick(profitOrLoss, 'gross_profit')?.amount ?? 0,
        profit: pick(profitOrLoss, 'profit_for_period')?.amount ?? 0,
        totalAssets: pick(financialPosition, 'total_assets')?.amount ?? 0,
        totalLiabilities: pick(financialPosition, 'total_liabilities')?.amount ?? 0,
        equity: pick(financialPosition, 'total_equity')?.amount ?? 0,
        cash: cashBalance(closingAcc),
        revenueCompare: pick(profitOrLoss, 'revenue')?.compare ?? null,
        profitCompare: pick(profitOrLoss, 'profit_for_period')?.compare ?? null,
      },
    };
  });
}
