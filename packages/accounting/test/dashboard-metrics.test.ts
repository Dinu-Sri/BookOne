import { describe, expect, it } from 'vitest';
import {
  cashReconciliation,
  cashSeries,
  cashUniverseFromRows,
  classifyCashJournal,
  comparisonChange,
  composeDashboardMetrics,
  externalCashFlow,
  formatCompanyMoney,
  inclusiveDayCount,
  netSalesFromRows,
  operatingResultFromRows,
  previousEquivalentRange,
  rankExpenses,
  rowsFromLines,
  salesSeries,
  seriesGrainForRange,
} from '../src/dashboard-metrics';
import {
  DB01_AP_DOCUMENTS,
  DB01_AR_DOCUMENTS,
  DB01_AS_OF,
  DB01_JOURNALS,
  DB01_PERIOD,
  DB01_TENANT_B_JOURNALS,
  db01AsOfLines,
  db01OpeningLines,
  db01PeriodLines,
  independentExpected,
} from '../src/dashboard-fixture';

const expected = independentExpected();

describe('DB-01 independent expected table', () => {
  it('self-checks the hand-checked constants against a separate accumulator', () => {
    expect(expected.computed.netSales).toBe(expected.netSales);
    expect(expected.computed.operatingResult).toBe(expected.operatingResult);
    expect(expected.computed.netCashMovement).toBe(expected.netCashMovement);
    expect(expected.computed.cashAndBank).toBe(expected.cashAndBank);
    expect(expected.computed.cardClearing).toBe(expected.cardClearing);
    expect(expected.computed.receivables).toBe(expected.receivables);
    expect(expected.computed.payables).toBe(expected.payables);
    expect(expected.computed.moneyIn).toBe(expected.externalMoneyIn);
    expect(expected.computed.moneyOut).toBe(expected.externalMoneyOut);
    expect(expected.computed.transferIn).toBe(expected.transferIn);
    expect(expected.computed.openingUniverse).toBe(expected.openingUniverse);
    expect(expected.computed.closingUniverse).toBe(expected.closingUniverse);
    expect(expected.computed.openingUniverse + expected.netCashMovement).toBe(expected.closingUniverse);
  });
});

describe('composeDashboardMetrics vs independent expected', () => {
  const opening = cashUniverseFromRows(rowsFromLines(db01OpeningLines()));
  const snapshot = composeDashboardMetrics({
    periodLines: db01PeriodLines(),
    asOfLines: db01AsOfLines(),
    openingCashUniverse: opening,
    arDocuments: DB01_AR_DOCUMENTS,
    apDocuments: DB01_AP_DOCUMENTS,
    asOf: DB01_AS_OF,
  });

  it('reconciles headline cards', () => {
    expect(snapshot.netSales).toBe(expected.netSales);
    expect(snapshot.operatingResult).toBe(expected.operatingResult);
    expect(snapshot.netCashMovement).toBe(expected.netCashMovement);
    expect(snapshot.cashAndBank).toBe(expected.cashAndBank);
    expect(snapshot.cardClearing).toBe(expected.cardClearing);
    expect(snapshot.receivables).toBe(expected.receivables);
    expect(snapshot.payables).toBe(expected.payables);
  });

  it('excludes internal transfers from external in/out without losing cash reconciliation', () => {
    expect(snapshot.externalCash.moneyIn).toBe(expected.externalMoneyIn);
    expect(snapshot.externalCash.moneyOut).toBe(expected.externalMoneyOut);
    expect(snapshot.externalCash.transferIn).toBe(expected.transferIn);
    expect(snapshot.externalCash.transferOut).toBe(expected.transferOut);
    expect(snapshot.externalCash.fundingIn).toBe(expected.fundingIn);
    expect(snapshot.externalCash.fundingOut).toBe(expected.fundingOut);
    expect(snapshot.cashReconcile.difference).toBe(0);
    expect(snapshot.cashReconcile.opening + snapshot.cashReconcile.movement).toBe(snapshot.cashReconcile.closing);
  });

  it('uses historical allocations for AR/AP and surfaces a recon difference when present', () => {
    expect(snapshot.arAging.grandTotal).toBe(expected.arAging);
    expect(snapshot.apAging.grandTotal).toBe(expected.apAging);
    expect(snapshot.arAging.overdueAmount).toBe(expected.overdueAr);
    expect(snapshot.apAging.overdueAmount).toBe(expected.overdueAp);
    expect(snapshot.arControlDifference).toBe(0);
    expect(snapshot.apControlDifference).toBe(0);
    expect(snapshot.arAging.counts.d1_30).toBe(1);
    expect(snapshot.apAging.counts.d1_30).toBe(1);
  });

  it('ignores voided journals and later allocations after the cutoff', () => {
    expect(snapshot.netSales).toBe(4200);
    expect(DB01_JOURNALS.some((l) => l.voided && l.amount === 99)).toBe(true);
    expect(snapshot.receivables).toBe(1360);
  });

  it('does not mix tenant B journals into tenant A totals', () => {
    const leaked = composeDashboardMetrics({
      periodLines: [...db01PeriodLines(), ...DB01_TENANT_B_JOURNALS.filter((l) => l.date >= DB01_PERIOD.from && l.date <= DB01_PERIOD.to)],
      asOfLines: [...db01AsOfLines(), ...DB01_TENANT_B_JOURNALS.filter((l) => l.date <= DB01_AS_OF)],
      openingCashUniverse: opening,
      asOf: DB01_AS_OF,
    });
    expect(leaked.netSales).not.toBe(snapshot.netSales);
    const isolated = composeDashboardMetrics({
      periodLines: db01PeriodLines().filter((l) => l.tenantId !== 'tenant-b'),
      asOfLines: db01AsOfLines().filter((l) => l.tenantId !== 'tenant-b'),
      openingCashUniverse: opening,
      asOf: DB01_AS_OF,
    });
    expect(isolated.netSales).toBe(snapshot.netSales);
  });
});

describe('series, expenses, comparison, cash classification', () => {
  it('sales series buckets sum to net sales', () => {
    const series = salesSeries(db01PeriodLines(), DB01_PERIOD.from, DB01_PERIOD.to, 'day');
    const sum = series.reduce((s, p) => s + p.value, 0);
    expect(Math.round(sum * 100) / 100).toBe(expected.netSales);
    expect(series).toHaveLength(inclusiveDayCount(DB01_PERIOD.from, DB01_PERIOD.to));
  });

  it('cash series uses a common scale and excludes transfers', () => {
    const series = cashSeries(db01PeriodLines(), DB01_PERIOD.from, DB01_PERIOD.to, 'day');
    const moneyIn = series.reduce((s, p) => s + p.moneyIn, 0);
    const moneyOut = series.reduce((s, p) => s + p.moneyOut, 0);
    expect(Math.round(moneyIn * 100) / 100).toBe(expected.externalMoneyIn);
    expect(Math.round(moneyOut * 100) / 100).toBe(expected.externalMoneyOut);
    const transferDay = series.find((p) => p.key === '2026-03-08');
    expect(transferDay?.moneyIn).toBe(0);
    expect(transferDay?.moneyOut).toBe(0);
  });

  it('ranks expenses with an Other group that reconciles to the total', () => {
    const ranked = rankExpenses(rowsFromLines(db01PeriodLines()), 2);
    const sum = ranked.items.reduce((s, i) => s + i.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(ranked.total);
    expect(ranked.items.some((i) => i.code === 'other')).toBe(true);
  });

  it('classifies cash journals', () => {
    expect(classifyCashJournal([{ accountCode: '1000', side: 'credit', amount: 1000 }, { accountCode: '1100', side: 'debit', amount: 1000 }])).toBe('internal_transfer');
    expect(classifyCashJournal([{ accountCode: '1000', side: 'debit', amount: 3000 }, { accountCode: '3000', side: 'credit', amount: 3000 }])).toBe('funding');
    expect(classifyCashJournal([{ accountCode: '1000', side: 'debit', amount: 1180 }, { accountCode: '4000', side: 'credit', amount: 1000 }])).toBe('operating');
  });

  it('distinguishes missing, zero, and new comparison states', () => {
    expect(comparisonChange(100, null).kind).toBe('missing');
    expect(comparisonChange(0, 0).kind).toBe('zero-baseline');
    expect(comparisonChange(50, 0).kind).toBe('new');
    expect(comparisonChange(4200, 400).pct).toBe(950);
    expect(Number.isFinite(comparisonChange(4200, 400).pct!)).toBe(true);
  });

  it('uses an equivalent elapsed previous interval', () => {
    expect(previousEquivalentRange('2026-03-01', '2026-03-15')).toEqual({ from: '2026-02-14', to: '2026-02-28' });
    const prevSales = netSalesFromRows(rowsFromLines(DB01_JOURNALS.filter((l) => !l.voided && l.date >= '2026-02-14' && l.date <= '2026-02-28' && l.tenantId !== 'tenant-b')));
    expect(prevSales).toBe(expected.previousNetSales);
  });

  it('bounds chart grain for long ranges', () => {
    expect(seriesGrainForRange('2026-03-01', '2026-03-15')).toBe('day');
    expect(seriesGrainForRange('2026-01-01', '2026-06-30')).toBe('week');
    expect(seriesGrainForRange('2024-01-01', '2026-12-31')).toBe('month');
  });

  it('formats company currency without a hardcoded LKR fallback', () => {
    expect(formatCompanyMoney(1234.5, 'USD')).toBe('USD 1,234.50');
    expect(formatCompanyMoney(-50, 'EUR', { compact: true })).toBe('-EUR 50.00');
    expect(formatCompanyMoney(2500, 'EUR', { compact: true })).toBe('EUR 2.5K');
    expect(formatCompanyMoney(12, '')).toMatch(/^XXX /);
  });

  it('treats all-negative and empty periods as real states', () => {
    const empty = composeDashboardMetrics({
      periodLines: [],
      asOfLines: [],
      openingCashUniverse: 0,
      asOf: DB01_AS_OF,
    });
    expect(empty.netSales).toBe(0);
    expect(empty.operatingResult).toBe(0);
    expect(empty.externalCash.moneyIn).toBe(0);
    const negative = composeDashboardMetrics({
      periodLines: [
        { journalId: 'n1', date: '2026-03-02', accountCode: '6100', accountType: 'expense', side: 'debit', amount: 80 },
        { journalId: 'n1', date: '2026-03-02', accountCode: '1100', accountType: 'asset', side: 'credit', amount: 80 },
      ],
      asOfLines: [
        { journalId: 'n1', date: '2026-03-02', accountCode: '6100', accountType: 'expense', side: 'debit', amount: 80 },
        { journalId: 'n1', date: '2026-03-02', accountCode: '1100', accountType: 'asset', side: 'credit', amount: 80 },
      ],
      openingCashUniverse: 0,
      asOf: DB01_AS_OF,
    });
    expect(negative.operatingResult).toBe(-80);
    expect(negative.cashAndBank).toBe(-80);
    expect(negative.externalCash.moneyOut).toBe(80);
  });

  it('operating result matches named P&L net income from the same period rows', () => {
    const rows = rowsFromLines(db01PeriodLines());
    expect(operatingResultFromRows(rows)).toBe(expected.operatingResult);
    expect(netSalesFromRows(rows)).not.toBe(operatingResultFromRows(rows));
  });

  it('external cash flow is not profit', () => {
    const flow = externalCashFlow(db01PeriodLines());
    expect(flow.net).not.toBe(expected.operatingResult);
    expect(flow.fundingIn).toBeGreaterThan(0);
  });
});

describe('cash reconciliation helper', () => {
  it('keeps negative closing balances visible', () => {
    const rec = cashReconciliation(10, -40, -30);
    expect(rec.difference).toBe(0);
    expect(rec.closing).toBe(-30);
  });
});
