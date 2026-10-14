import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '../db';
import {
  accounts,
  auditLog,
  bankImportIssues,
  bankReconciliationCaseBankLines,
  bankReconciliationCaseBookTransactions,
  bankReconciliationCases,
  bankReconciliationEvents,
  bankReconciliationOutstandingItems,
  bankReconciliationSessionImports,
  bankReconciliationSessions,
  bankReconciliationSnapshots,
  bankStatementImportEvents,
  bankStatementImports,
  bankStatementLines,
  bankStatementProfiles,
  bankStatementProfileVersions,
  brands,
  businessDocumentLines,
  businessDocuments,
  companyDomains,
  companyProfiles,
  documentStyles,
  financialYears,
  inventoryCostLayerConsumptions,
  inventoryCostLayers,
  inventoryMovements,
  inventoryProductCategories,
  inventoryProducts,
  inventorySettings,
  inventoryStockDocLines,
  inventoryStockDocs,
  inventoryStockLevels,
  journalEntries,
  journalLines,
  locations,
  parties,
  periodLocks,
  posRegisters,
  posShifts,
  purchaseSettings,
  rentalBookingLines,
  rentalEvents,
  rentalKitComponents,
  rentalReturnPhotos,
  rentalSerials,
  rentalSettings,
  salesDiscounts,
  salesInvoiceSources,
  salesSettings,
  settlementAllocations,
  taxInvoiceSequences,
  taxProfiles,
  tenantMembershipRoles,
  tenantMemberships,
  tenantMembershipScopes,
  tenantPermissionOverrides,
  tenantRolePermissions,
  tenantRoles,
  tenantTeamMembers,
  tenantTeams,
  tenants,
  transactions,
} from '../schema';
import {
  ARCHIVE_DATA_TABLE_NAMES,
  ARCHIVE_EXCLUDED_TABLES,
  canonicalJson,
  jsonReplacer,
  type ArchiveManifest,
} from './format';
import { sha256Hex } from './crypto';

type DumpTable = {
  table: PgTable;
  /** tenants uses id; every other dump table uses tenant_id. */
  by: 'tenantId' | 'id';
};

export const ARCHIVE_DUMP_TABLES: DumpTable[] = [
  { table: tenants, by: 'id' },
  { table: accounts, by: 'tenantId' },
  { table: parties, by: 'tenantId' },
  { table: transactions, by: 'tenantId' },
  { table: journalEntries, by: 'tenantId' },
  { table: journalLines, by: 'tenantId' },
  { table: settlementAllocations, by: 'tenantId' },
  { table: auditLog, by: 'tenantId' },
  { table: periodLocks, by: 'tenantId' },
  { table: bankStatementProfiles, by: 'tenantId' },
  { table: bankStatementProfileVersions, by: 'tenantId' },
  { table: bankStatementImports, by: 'tenantId' },
  { table: bankStatementLines, by: 'tenantId' },
  { table: bankStatementImportEvents, by: 'tenantId' },
  { table: bankImportIssues, by: 'tenantId' },
  { table: bankReconciliationSessions, by: 'tenantId' },
  { table: bankReconciliationSessionImports, by: 'tenantId' },
  { table: bankReconciliationCases, by: 'tenantId' },
  { table: bankReconciliationCaseBankLines, by: 'tenantId' },
  { table: bankReconciliationCaseBookTransactions, by: 'tenantId' },
  { table: bankReconciliationOutstandingItems, by: 'tenantId' },
  { table: bankReconciliationEvents, by: 'tenantId' },
  { table: bankReconciliationSnapshots, by: 'tenantId' },
  { table: businessDocuments, by: 'tenantId' },
  { table: businessDocumentLines, by: 'tenantId' },
  { table: documentStyles, by: 'tenantId' },
  { table: tenantMemberships, by: 'tenantId' },
  { table: companyProfiles, by: 'tenantId' },
  { table: taxProfiles, by: 'tenantId' },
  { table: financialYears, by: 'tenantId' },
  { table: brands, by: 'tenantId' },
  { table: locations, by: 'tenantId' },
  { table: companyDomains, by: 'tenantId' },
  { table: inventoryProducts, by: 'tenantId' },
  { table: inventoryProductCategories, by: 'tenantId' },
  { table: inventoryStockLevels, by: 'tenantId' },
  { table: inventoryStockDocs, by: 'tenantId' },
  { table: inventoryStockDocLines, by: 'tenantId' },
  { table: inventoryMovements, by: 'tenantId' },
  { table: inventoryCostLayers, by: 'tenantId' },
  { table: inventoryCostLayerConsumptions, by: 'tenantId' },
  { table: salesDiscounts, by: 'tenantId' },
  { table: salesSettings, by: 'tenantId' },
  { table: taxInvoiceSequences, by: 'tenantId' },
  { table: salesInvoiceSources, by: 'tenantId' },
  { table: purchaseSettings, by: 'tenantId' },
  { table: inventorySettings, by: 'tenantId' },
  { table: rentalSettings, by: 'tenantId' },
  { table: rentalEvents, by: 'tenantId' },
  { table: rentalBookingLines, by: 'tenantId' },
  { table: rentalReturnPhotos, by: 'tenantId' },
  { table: rentalKitComponents, by: 'tenantId' },
  { table: rentalSerials, by: 'tenantId' },
  { table: posRegisters, by: 'tenantId' },
  { table: posShifts, by: 'tenantId' },
  { table: tenantRoles, by: 'tenantId' },
  { table: tenantRolePermissions, by: 'tenantId' },
  { table: tenantMembershipRoles, by: 'tenantId' },
  { table: tenantPermissionOverrides, by: 'tenantId' },
  { table: tenantTeams, by: 'tenantId' },
  { table: tenantTeamMembers, by: 'tenantId' },
  { table: tenantMembershipScopes, by: 'tenantId' },
];

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row, jsonReplacer)) as Record<string, unknown>;
}

export function archiveExcludedTables(): readonly string[] {
  return ARCHIVE_EXCLUDED_TABLES;
}

export function archiveDataTableNames(): string[] {
  const names = ARCHIVE_DUMP_TABLES.map((entry) => getTableName(entry.table));
  const expected = new Set<string>(ARCHIVE_DATA_TABLE_NAMES);
  if (names.length !== expected.size || names.some((name) => !expected.has(name))) {
    throw new Error('Archive table list is out of date.');
  }
  return names;
}

export async function snapshotTenantTables(tenantId: string): Promise<{
  tables: Record<string, Record<string, unknown>[]>;
  rowCounts: Record<string, number>;
}> {
  archiveDataTableNames();
  const tables: Record<string, Record<string, unknown>[]> = {};
  const rowCounts: Record<string, number> = {};
  for (const entry of ARCHIVE_DUMP_TABLES) {
    const name = getTableName(entry.table);
    const col = entry.by === 'id' ? (entry.table as typeof tenants).id : (entry.table as typeof accounts).tenantId;
    const rows = await db()
      .select()
      .from(entry.table)
      .where(eq(col as never, tenantId));
    const serialized = rows.map((row) => serializeRow(row as Record<string, unknown>));
    tables[name] = serialized;
    rowCounts[name] = serialized.length;
  }
  return { tables, rowCounts };
}

export async function trialBalanceHash(tenantId: string): Promise<string> {
  const rows = await db()
    .select({
      code: accounts.code,
      debit: sql<string>`coalesce(sum(case when ${journalLines.side} = 'debit' then ${journalLines.amount}::numeric else 0 end), 0)`,
      credit: sql<string>`coalesce(sum(case when ${journalLines.side} = 'credit' then ${journalLines.amount}::numeric else 0 end), 0)`,
    })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(
      and(
        eq(journalLines.tenantId, tenantId),
        eq(accounts.tenantId, tenantId),
        isNull(journalLines.voidedAt),
        isNull(accounts.voidedAt),
      ),
    )
    .groupBy(accounts.code)
    .orderBy(asc(accounts.code));
  const lines = rows.map((r) => `${r.code}|${r.debit}|${r.credit}`);
  return sha256Hex(lines.join('\n'));
}

export async function collectLiveStoragePointers(tenantId: string): Promise<string[]> {
  const [txns, styles, products, photos, imports] = await Promise.all([
    db()
      .select({ receiptRef: transactions.receiptRef })
      .from(transactions)
      .where(eq(transactions.tenantId, tenantId)),
    db()
      .select({ logoImageKey: documentStyles.logoImageKey })
      .from(documentStyles)
      .where(eq(documentStyles.tenantId, tenantId)),
    db()
      .select({ imageKey: inventoryProducts.imageKey })
      .from(inventoryProducts)
      .where(eq(inventoryProducts.tenantId, tenantId)),
    db()
      .select({ imageKey: rentalReturnPhotos.imageKey })
      .from(rentalReturnPhotos)
      .where(eq(rentalReturnPhotos.tenantId, tenantId)),
    db()
      .select({ storageKey: bankStatementImports.storageKey })
      .from(bankStatementImports)
      .where(eq(bankStatementImports.tenantId, tenantId)),
  ]);
  return collectStoragePointers({
    transactions: txns as Record<string, unknown>[],
    document_styles: styles as Record<string, unknown>[],
    inventory_products: products as Record<string, unknown>[],
    rental_return_photos: photos as Record<string, unknown>[],
    bank_statement_imports: imports as Record<string, unknown>[],
  });
}

export function collectStoragePointers(tables: Record<string, Record<string, unknown>[]>): string[] {
  const keys = new Set<string>();
  const take = (value: unknown) => {
    if (typeof value === 'string' && value.length > 0) keys.add(value);
  };
  for (const row of tables.transactions ?? []) take(row.receiptRef);
  for (const row of tables.document_styles ?? []) take(row.logoImageKey);
  for (const row of tables.inventory_products ?? []) take(row.imageKey);
  for (const row of tables.rental_return_photos ?? []) take(row.imageKey);
  for (const row of tables.bank_statement_imports ?? []) take(row.storageKey);
  return [...keys];
}

export function buildArchiveEnvelope(args: {
  kind: ArchiveManifest['kind'];
  manifest: ArchiveManifest;
  tables?: Record<string, Record<string, unknown>[]>;
  objects?: Array<{ key: string; contentType: string; sha256: string; size: number; bodyBase64: string }>;
}): string {
  return canonicalJson({
    format: args.manifest.format,
    kind: args.kind,
    manifest: args.manifest,
    tables: args.tables ?? {},
    objects: args.objects ?? [],
  });
}
