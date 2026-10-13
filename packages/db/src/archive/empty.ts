import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  bankReconciliationSessions,
  bankStatementImports,
  businessDocumentLines,
  businessDocuments,
  inventoryMovements,
  inventoryProducts,
  inventoryStockDocs,
  journalEntries,
  journalLines,
  parties,
  posShifts,
  rentalEvents,
  settlementAllocations,
  transactions,
} from '../schema';
import { isOperationallyEmpty, TRADING_COUNT_KEYS, type TradingCountKey } from './format';

type Countable = {
  tenantId: unknown;
  voidedAt?: unknown;
};

async function countRows(table: Countable, tenantId: string, hasVoided: boolean): Promise<number> {
  const where = hasVoided
    ? and(eq(table.tenantId as never, tenantId), isNull(table.voidedAt as never))
    : eq(table.tenantId as never, tenantId);
  const rows: Array<{ n: number }> = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(table as never)
    .where(where);
  return Number(rows[0]?.n ?? 0);
}

export async function tradingActivityCounts(tenantId: string): Promise<Record<TradingCountKey, number>> {
  const counts = {
    parties: await countRows(parties, tenantId, true),
    transactions: await countRows(transactions, tenantId, true),
    journal_entries: await countRows(journalEntries, tenantId, true),
    journal_lines: await countRows(journalLines, tenantId, true),
    business_documents: await countRows(businessDocuments, tenantId, true),
    business_document_lines: await countRows(businessDocumentLines, tenantId, true),
    inventory_products: await countRows(inventoryProducts, tenantId, true),
    inventory_stock_docs: await countRows(inventoryStockDocs, tenantId, true),
    inventory_movements: await countRows(inventoryMovements, tenantId, false),
    settlement_allocations: await countRows(settlementAllocations, tenantId, true),
    pos_shifts: await countRows(posShifts, tenantId, false),
    bank_statement_imports: await countRows(bankStatementImports, tenantId, true),
    bank_reconciliation_sessions: await countRows(bankReconciliationSessions, tenantId, true),
    rental_events: await countRows(rentalEvents, tenantId, true),
  } satisfies Record<TradingCountKey, number>;
  return counts;
}

export async function tenantIsOperationallyEmpty(tenantId: string): Promise<{
  empty: boolean;
  counts: Record<TradingCountKey, number>;
}> {
  const counts = await tradingActivityCounts(tenantId);
  return { empty: isOperationallyEmpty(counts), counts };
}

export { TRADING_COUNT_KEYS, isOperationallyEmpty };
