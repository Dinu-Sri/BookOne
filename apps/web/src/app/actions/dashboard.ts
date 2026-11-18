'use server';

import {
  AGING_BUCKETS,
  CARD_CLEARING_CODE,
  DASHBOARD_METRIC_IDS,
  cashSeries,
  cashUniverseFromRows,
  composeDashboardMetrics,
  comparisonChange,
  formatCompanyMoney,
  previousEquivalentRange,
  rowsFromLines,
  salesSeries,
  seriesGrainForRange,
  withPreviousCashSeries,
  withPreviousSeries,
  type AgingBucket,
  type CashSeriesPoint,
  type ComparisonChange,
  type DashboardJournalLine,
  type RankedExpense,
  type SeriesPoint,
} from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  agentBridgeDocuments,
  and,
  businessDocuments,
  companyProfiles,
  db,
  eq,
  gte,
  inArray,
  inventoryProducts,
  inventoryStockLevels,
  isNull,
  journalEntries,
  journalLines,
  lte,
  posShifts,
  sql,
  transactions,
  withTenantContext,
} from '@bookone/db';
import { assertPermission, getMyAccess } from '@/lib/access';
import { columnInScope, currentDimensionScope } from '@/lib/dimension-scope';
import {
  normalizePeriodToken,
  previousPeriodToken,
  resolvePeriodBounds,
  type PeriodBounds,
} from '@/lib/period-range';
import { getArAgingSummary, getApAgingSummary } from '@/app/actions/commercial-docs';
import { getTenantInfo } from '@/app/actions/workspace';

export type WidgetStatus = 'ok' | 'empty' | 'error' | 'unavailable';

export type Widget<T> = {
  status: WidgetStatus;
  error?: string;
  data?: T;
  freshness: 'cutoff' | 'period' | 'current';
};

export type HeadlineMetric = {
  id: string;
  label: string;
  amount: number;
  display: string;
  exact: string;
  note: string;
  href: string;
  comparison?: ComparisonChange;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
};

export type AttentionItem = {
  id: string;
  label: string;
  count: number;
  amount?: number;
  amountDisplay?: string;
  href: string;
  freshness: 'cutoff' | 'current' | 'period';
  note: string;
};

export type AgingView = {
  amounts: Record<AgingBucket, number>;
  counts: Record<AgingBucket, number>;
  grandTotal: number;
  overdueAmount: number;
  overdueCount: number;
  controlBalance: number;
  difference: number;
  href: string;
};

export type BusinessOverview = {
  generatedAt: string;
  currency: string;
  timezone: string;
  companyName: string;
  periodToken: string;
  periodLabel: string;
  periodFrom: string | null;
  periodTo: string | null;
  asOf: string;
  compare: boolean;
  compareLabel: string | null;
  compareFrom: string | null;
  compareTo: string | null;
  availablePeriods: string[];
  headlines: {
    period: HeadlineMetric[];
    position: HeadlineMetric[];
  };
  cardClearing: { amount: number; display: string; note: string };
  sales: Widget<{ series: SeriesPoint[]; grain: string }>;
  cash: Widget<{
    series: CashSeriesPoint[];
    grain: string;
    moneyIn: number;
    moneyOut: number;
    fundingIn: number;
    fundingOut: number;
    transferIn: number;
    transferOut: number;
  }>;
  ar: Widget<AgingView>;
  ap: Widget<AgingView>;
  expenses: Widget<{ items: RankedExpense[]; total: number }>;
  attention: Widget<AttentionItem[]>;
  modules: {
    sales: boolean;
    purchase: boolean;
    inventory: boolean;
    pos: boolean;
    inbox: boolean;
  };
  deferred: string[];
  queryCount: number;
};

function widgetOk<T>(data: T, freshness: Widget<T>['freshness']): Widget<T> {
  return { status: 'ok', data, freshness };
}
function widgetErr<T>(message: string, freshness: Widget<T>['freshness']): Widget<T> {
  return { status: 'error', error: message, freshness };
}
function widgetUnavailable<T>(message: string, freshness: Widget<T>['freshness']): Widget<T> {
  return { status: 'unavailable', error: message, freshness };
}

function toneForSigned(amount: number, invert = false): HeadlineMetric['tone'] {
  if (amount > 0.005) return invert ? 'warning' : 'success';
  if (amount < -0.005) return invert ? 'success' : 'danger';
  return 'neutral';
}

async function loadJournalLines(
  tenantId: string,
  from: string | null,
  to: string | null,
): Promise<DashboardJournalLine[]> {
  const conditions = [
    eq(journalLines.tenantId, tenantId),
    isNull(journalLines.voidedAt),
    isNull(journalEntries.voidedAt),
    isNull(accounts.voidedAt),
  ];
  if (from) conditions.push(gte(journalEntries.entryDate, from));
  if (to) conditions.push(lte(journalEntries.entryDate, to));
  const scope = await currentDimensionScope();
  const loc = columnInScope(journalLines.locationId, scope.locationIds);
  const brand = columnInScope(journalLines.brandId, scope.brandIds);
  if (loc) conditions.push(loc);
  if (brand) conditions.push(brand);

  const rows = await db()
    .select({
      journalId: journalEntries.id,
      date: journalEntries.entryDate,
      accountCode: accounts.code,
      accountType: accounts.type,
      accountName: accounts.name,
      side: journalLines.side,
      amount: journalLines.amount,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(and(...conditions));

  return rows.map((row) => ({
    journalId: row.journalId,
    date: row.date,
    accountCode: row.accountCode,
    accountType: row.accountType,
    accountName: row.accountName,
    side: row.side,
    amount: Number(row.amount),
    tenantId,
  }));
}

function asOfDate(bounds: PeriodBounds, todayIso: string): string {
  return bounds.to ?? todayIso;
}

function periodHref(path: string, token: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ period: token, ...extra });
  return `${path}?${params.toString()}`;
}

export async function getBusinessOverview(input?: {
  period?: string | null;
  compare?: string | null;
}): Promise<BusinessOverview> {
  await assertPermission('accounting.dashboard.read', 'read');
  const user = await requireTenantContext();
  const tenant = await getTenantInfo();
  const timezone = tenant.timezone || 'Asia/Colombo';
  const currency = tenant.baseCurrency || 'LKR';
  const selected = normalizePeriodToken(input?.period ?? 'mtd');
  const bounds = resolvePeriodBounds(selected, { timeZone: timezone });
  const todayIso = resolvePeriodBounds('today', { timeZone: timezone }).to ?? new Date().toISOString().slice(0, 10);
  const asOf = asOfDate(bounds, todayIso);
  const compareOn = input?.compare !== '0';
  const previous = compareOn
    ? bounds.from && bounds.to
      ? previousPeriodToken(selected, { timeZone: timezone })
      : null
    : null;
  const generatedAt = new Date().toISOString();
  let queryCount = 0;

  return withTenantContext(user.tenantId, async () => {
    queryCount += 1;
    const [profile] = await db()
      .select({
        timezone: companyProfiles.timezone,
        baseCurrency: companyProfiles.baseCurrency,
      })
      .from(companyProfiles)
      .where(eq(companyProfiles.tenantId, user.tenantId))
      .limit(1);
    const moneyCurrency = (profile?.baseCurrency || currency).toUpperCase();

    const openingTo = bounds.from ? previousEquivalentRange(bounds.from, bounds.from).to : null;
    queryCount += 3;
    const [periodLines, asOfLines, openingLines] = await Promise.all([
      loadJournalLines(user.tenantId, bounds.from, bounds.to ?? asOf),
      loadJournalLines(user.tenantId, null, asOf),
      openingTo ? loadJournalLines(user.tenantId, null, openingTo) : Promise.resolve([] as DashboardJournalLine[]),
    ]);

    let previousPeriodLines: DashboardJournalLine[] = [];
    if (previous?.from && previous.to) {
      queryCount += 1;
      previousPeriodLines = await loadJournalLines(user.tenantId, previous.from, previous.to);
    }

    const openingUniverse = cashUniverseFromRows(rowsFromLines(openingLines));
    const snapshot = composeDashboardMetrics({
      periodLines,
      asOfLines,
      openingCashUniverse: openingUniverse,
      asOf,
    });
    const previousSnapshot =
      previousPeriodLines.length || previous
        ? composeDashboardMetrics({
            periodLines: previousPeriodLines,
            asOfLines: previousPeriodLines,
            openingCashUniverse: 0,
            asOf: previous?.to ?? asOf,
          })
        : null;

    const money = (n: number, compact = true) => formatCompanyMoney(n, moneyCurrency, { compact });
    const exact = (n: number) => formatCompanyMoney(n, moneyCurrency);
    const cmp = (current: number, prev: number | null | undefined) =>
      compareOn ? comparisonChange(current, prev ?? null) : undefined;

    const periodQs = selected;
    const headlines = {
      period: [
        {
          id: DASHBOARD_METRIC_IDS.netSales,
          label: 'Net sales',
          amount: snapshot.netSales,
          display: money(snapshot.netSales),
          exact: exact(snapshot.netSales),
          note: 'Ledger 4000 − 4100. VAT stays on 2200.',
          href: periodHref('/reports', periodQs),
          comparison: cmp(snapshot.netSales, previousSnapshot?.netSales),
          tone: toneForSigned(snapshot.netSales),
        },
        {
          id: DASHBOARD_METRIC_IDS.operatingResult,
          label: 'Operating result',
          amount: snapshot.operatingResult,
          display: money(snapshot.operatingResult),
          exact: exact(snapshot.operatingResult),
          note: 'Named P&L net income (revenue − expenses including COGS).',
          href: periodHref('/reports', periodQs),
          comparison: cmp(snapshot.operatingResult, previousSnapshot?.operatingResult),
          tone: toneForSigned(snapshot.operatingResult),
        },
        {
          id: DASHBOARD_METRIC_IDS.netCashMovement,
          label: 'Net cash movement',
          amount: snapshot.netCashMovement,
          display: money(snapshot.netCashMovement),
          exact: exact(snapshot.netCashMovement),
          note: `Opening ${exact(snapshot.cashReconcile.opening)} + movement = closing ${exact(snapshot.cashReconcile.closing)}.`,
          href: periodHref('/reports', periodQs),
          comparison: cmp(snapshot.netCashMovement, previousSnapshot?.netCashMovement),
          tone: toneForSigned(snapshot.netCashMovement),
        },
      ] satisfies HeadlineMetric[],
      position: [
        {
          id: DASHBOARD_METRIC_IDS.cashAndBank,
          label: 'Cash and bank',
          amount: snapshot.cashAndBank,
          display: money(snapshot.cashAndBank),
          exact: exact(snapshot.cashAndBank),
          note: 'Spendable 1000 + 1100 as of range end. Card clearing excluded.',
          href: '/accounts',
          comparison: undefined,
          tone: snapshot.cashAndBank < 0 ? 'danger' : 'neutral',
        },
        {
          id: DASHBOARD_METRIC_IDS.receivables,
          label: 'Receivables',
          amount: snapshot.receivables,
          display: money(snapshot.receivables),
          exact: exact(snapshot.receivables),
          note: 'Control account 1300 as of range end.',
          href: `/sales/aging?asOf=${asOf}`,
          comparison: undefined,
          tone: snapshot.receivables > 0.005 ? 'warning' : 'neutral',
        },
        {
          id: DASHBOARD_METRIC_IDS.payables,
          label: 'Payables',
          amount: snapshot.payables,
          display: money(snapshot.payables),
          exact: exact(snapshot.payables),
          note: 'Control account 2100 as of range end.',
          href: `/purchase/aging?asOf=${asOf}`,
          comparison: undefined,
          tone: snapshot.payables > 0.005 ? 'info' : 'neutral',
        },
      ] satisfies HeadlineMetric[],
    };

    const grain = bounds.from && bounds.to ? seriesGrainForRange(bounds.from, bounds.to) : 'month';
    const from = bounds.from ?? (periodLines[0]?.date ?? asOf);
    const to = bounds.to ?? asOf;
    const salesPoints = salesSeries(periodLines, from, to, grain);
    const prevSales =
      previous?.from && previous.to ? salesSeries(previousPeriodLines, previous.from, previous.to, grain) : [];
    const cashPoints = cashSeries(periodLines, from, to, grain);
    const prevCash =
      previous?.from && previous.to ? cashSeries(previousPeriodLines, previous.from, previous.to, grain) : [];

    const access = await getMyAccess();
    const can = (key: string) => Boolean(access?.allows(key, 'read'));
    const modules = tenant.modules ?? { sales: true, purchase: true, inventory: false, pos: false, rental: false, hr: false };

    let ar: BusinessOverview['ar'];
    let ap: BusinessOverview['ap'];
    try {
      if (!modules.sales || !can('sales.aging.read')) {
        ar = widgetUnavailable('AR aging needs Sales aging permission.', 'cutoff');
      } else {
        queryCount += 1;
        const summary = await getArAgingSummary(asOf);
        const overdueAmount = summary.grandTotal - summary.totals.current;
        ar = widgetOk(
          {
            amounts: summary.totals,
            counts: Object.fromEntries(
              AGING_BUCKETS.map((b) => [b, summary.rows.filter((r) => r.bucket === b).length]),
            ) as Record<AgingBucket, number>,
            grandTotal: summary.grandTotal,
            overdueAmount: Math.round(overdueAmount * 100) / 100,
            overdueCount: summary.rows.filter((r) => r.bucket !== 'current').length,
            controlBalance: snapshot.receivables,
            difference: Math.round((summary.grandTotal - snapshot.receivables) * 100) / 100,
            href: `/sales/aging?asOf=${asOf}`,
          },
          'cutoff',
        );
      }
    } catch (err) {
      ar = widgetErr(err instanceof Error ? err.message : 'Could not load AR aging.', 'cutoff');
    }

    try {
      if (!modules.purchase || !can('purchase.aging.read')) {
        ap = widgetUnavailable('AP aging needs Purchase aging permission.', 'cutoff');
      } else {
        queryCount += 1;
        const summary = await getApAgingSummary(asOf);
        const overdueAmount = summary.grandTotal - summary.totals.current;
        ap = widgetOk(
          {
            amounts: summary.totals,
            counts: Object.fromEntries(
              AGING_BUCKETS.map((b) => [b, summary.rows.filter((r) => r.bucket === b).length]),
            ) as Record<AgingBucket, number>,
            grandTotal: summary.grandTotal,
            overdueAmount: Math.round(overdueAmount * 100) / 100,
            overdueCount: summary.rows.filter((r) => r.bucket !== 'current').length,
            controlBalance: snapshot.payables,
            difference: Math.round((summary.grandTotal - snapshot.payables) * 100) / 100,
            href: `/purchase/aging?asOf=${asOf}`,
          },
          'cutoff',
        );
      }
    } catch (err) {
      ap = widgetErr(err instanceof Error ? err.message : 'Could not load AP aging.', 'cutoff');
    }

    const attentionItems: AttentionItem[] = [];
    if (ar.status === 'ok' && ar.data && ar.data.overdueCount > 0) {
      attentionItems.push({
        id: 'overdue-invoices',
        label: 'Overdue invoices',
        count: ar.data.overdueCount,
        amount: ar.data.overdueAmount,
        amountDisplay: exact(ar.data.overdueAmount),
        href: `/sales/aging?asOf=${asOf}`,
        freshness: 'cutoff',
        note: 'Open customer balances past due at the selected end date.',
      });
    }
    if (ap.status === 'ok' && ap.data && ap.data.overdueCount > 0) {
      attentionItems.push({
        id: 'overdue-bills',
        label: 'Overdue bills',
        count: ap.data.overdueCount,
        amount: ap.data.overdueAmount,
        amountDisplay: exact(ap.data.overdueAmount),
        href: `/purchase/aging?asOf=${asOf}`,
        freshness: 'cutoff',
        note: 'Open supplier balances past due at the selected end date.',
      });
    }

    try {
      if (can('sales.invoices.read') || can('purchase.bills.read')) {
        queryCount += 1;
        const draftTypes: string[] = [];
        if (can('sales.invoices.read')) draftTypes.push('invoice', 'tax_invoice', 'pos_sale');
        if (can('purchase.bills.read')) draftTypes.push('bill', 'expense_bill', 'purchase_bill');
        const [{ count }] = await db()
          .select({ count: sql<number>`count(*)` })
          .from(businessDocuments)
          .where(
            and(
              eq(businessDocuments.tenantId, user.tenantId),
              isNull(businessDocuments.voidedAt),
              inArray(businessDocuments.status, ['draft', 'pending_approval']),
              draftTypes.length ? inArray(businessDocuments.documentType, draftTypes) : sql`false`,
            ),
          );
        const n = Number(count) || 0;
        if (n > 0) {
          attentionItems.push({
            id: 'outstanding-docs',
            label: 'Outstanding documents',
            count: n,
            href: can('sales.invoices.read') ? '/sales/invoices' : '/purchase/purchases',
            freshness: 'current',
            note: 'Current drafts and bills awaiting approval. Not reconstructed historically.',
          });
        }
      }
    } catch {
      /* keep other attention items */
    }

    try {
      if (modules.pos && (can('pos.history.read') || can('pos.terminal.read'))) {
        queryCount += 1;
        const [{ count }] = await db()
          .select({ count: sql<number>`count(*)` })
          .from(posShifts)
          .where(and(eq(posShifts.tenantId, user.tenantId), eq(posShifts.status, 'open')));
        const n = Number(count) || 0;
        if (n > 0) {
          attentionItems.push({
            id: 'open-shifts',
            label: 'Open POS shifts',
            count: n,
            href: '/sales/pos/shifts',
            freshness: 'current',
            note: 'Current open register shifts.',
          });
        }
      }
    } catch {
      /* optional */
    }

    try {
      if (modules.inventory && can('inventory.levels.read')) {
        queryCount += 1;
        const rows = await db()
          .select({
            productId: inventoryProducts.id,
            reorder: inventoryProducts.reorderLevel,
            qty: sql<string>`coalesce(sum(cast(${inventoryStockLevels.qtyOnHand} as numeric)), 0)`,
          })
          .from(inventoryProducts)
          .leftJoin(inventoryStockLevels, eq(inventoryStockLevels.productId, inventoryProducts.id))
          .where(and(eq(inventoryProducts.tenantId, user.tenantId), isNull(inventoryProducts.voidedAt)))
          .groupBy(inventoryProducts.id, inventoryProducts.reorderLevel);
        const low = rows.filter((r) => r.reorder != null && Number(r.qty) <= Number(r.reorder)).length;
        if (low > 0) {
          attentionItems.push({
            id: 'low-stock',
            label: 'Stock exceptions',
            count: low,
            href: '/inventory/levels?low=1',
            freshness: 'current',
            note: 'Current on-hand vs reorder. Historical stock aging is not available.',
          });
        }
      }
    } catch {
      /* optional */
    }

    try {
      queryCount += 1;
      const reviewConditions = [
        eq(transactions.tenantId, user.tenantId),
        isNull(transactions.voidedAt),
        sql`${transactions.categoryConfidence} IS NOT NULL AND ${transactions.categoryConfidence}::numeric < 0.7`,
      ];
      if (bounds.from) reviewConditions.push(gte(transactions.date, bounds.from));
      if (bounds.to) reviewConditions.push(lte(transactions.date, bounds.to));
      const [{ count }] = await db()
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(and(...reviewConditions));
      const n = Number(count) || 0;
      if (n > 0 && can('accounting.transactions.read')) {
        attentionItems.push({
          id: 'category-review',
          label: 'Category reviews',
          count: n,
          href: '/transactions',
          freshness: 'period',
          note: 'Entries below 70% category confidence. This is not an accounting-health certification.',
        });
      }
    } catch {
      /* optional */
    }

    try {
      if (tenant.agentBridgeEnabled && can('purchase.inbox.read')) {
        queryCount += 1;
        const [{ count }] = await db()
          .select({ count: sql<number>`count(*)` })
          .from(agentBridgeDocuments)
          .where(
            and(
              eq(agentBridgeDocuments.tenantId, user.tenantId),
              inArray(agentBridgeDocuments.status, [
                'received',
                'extracting',
                'awaiting_facts',
                'needs_clarification',
                'draft',
                'awaiting_approval',
              ]),
            ),
          );
        const n = Number(count) || 0;
        if (n > 0) {
          attentionItems.push({
            id: 'inbox',
            label: 'Document inbox',
            count: n,
            href: '/purchase/inbox',
            freshness: 'current',
            note: 'Open AgentBridge inbox items. Inbox state is not accounting-health certification.',
          });
        }
      }
    } catch {
      /* optional */
    }

    queryCount += 1;
    const monthRows = await db()
      .select({ date: transactions.date })
      .from(transactions)
      .where(and(eq(transactions.tenantId, user.tenantId), isNull(transactions.voidedAt)));
    const available = Array.from(
      new Set(monthRows.map((r) => r.date?.slice(0, 7)).filter((m): m is string => Boolean(m))),
    )
      .sort()
      .reverse();

    const deferred = [
      'Historical stock valuation and stock aging (no stock snapshots).',
      'Top products / customers (needs verified margin data).',
      'VAT filing declaration (use the Reports VAT summary).',
    ];

    return {
      generatedAt,
      currency: moneyCurrency,
      timezone: profile?.timezone || timezone,
      companyName: tenant.name,
      periodToken: selected,
      periodLabel: bounds.label,
      periodFrom: bounds.from,
      periodTo: bounds.to,
      asOf,
      compare: compareOn,
      compareLabel: previous?.label ?? null,
      compareFrom: previous?.from ?? null,
      compareTo: previous?.to ?? null,
      availablePeriods: available,
      headlines,
      cardClearing: {
        amount: snapshot.cardClearing,
        display: exact(snapshot.cardClearing),
        note: `Account ${CARD_CLEARING_CODE} is unsettled card receipts, not spendable cash.`,
      },
      sales: widgetOk(
        { series: withPreviousSeries(salesPoints, prevSales), grain },
        'period',
      ),
      cash: widgetOk(
        {
          series: withPreviousCashSeries(cashPoints, prevCash),
          grain,
          moneyIn: snapshot.externalCash.moneyIn,
          moneyOut: snapshot.externalCash.moneyOut,
          fundingIn: snapshot.externalCash.fundingIn,
          fundingOut: snapshot.externalCash.fundingOut,
          transferIn: snapshot.externalCash.transferIn,
          transferOut: snapshot.externalCash.transferOut,
        },
        'period',
      ),
      ar,
      ap,
      expenses: widgetOk(snapshot.expenses, 'period'),
      attention: widgetOk(attentionItems, 'cutoff'),
      modules: {
        sales: Boolean(modules.sales),
        purchase: Boolean(modules.purchase),
        inventory: Boolean(modules.inventory),
        pos: Boolean(modules.pos),
        inbox: Boolean(tenant.agentBridgeEnabled),
      },
      deferred,
      queryCount,
    };
  });
}
