'use server';

import { revalidatePath } from 'next/cache';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { requireTenantContext } from '@bookone/auth';
import {
  auditLog,
  bankStatementImports,
  bankStatementLines,
  businessDocumentLines,
  businessDocuments,
  db,
  eq,
  healthCheckRuns,
  inventoryMovements,
  inventoryProducts,
  inventoryStockDocLines,
  inventoryStockDocs,
  inventoryStockLevels,
  journalEntries,
  journalLines,
  parties,
  periodLocks,
  posShifts,
  salesDiscounts,
  salesInvoiceSources,
  settlementAllocations,
  taxInvoiceSequences,
  tenants,
  transactions,
  withTenantContext,
} from '@bookone/db';

export interface ResetCompanyResult {
  ok: boolean;
  deletedFiles?: number;
  tablesCleared?: number;
  warning?: string;
  error?: string;
}

function isPrivileged(user: { role: string; email: string }) {
  return (
    user.role === 'admin' ||
    user.role === 'super_admin' ||
    user.role === 'owner' ||
    user.email === 'dinu.sri.m@gmail.com'
  );
}

function makeClient(): S3Client | null {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    credentials: { accessKeyId, secretAccessKey },
  });
}

function storageWarning(prefix: string, error: unknown): string {
  const message = error instanceof Error ? error.message : 'Storage cleanup failed.';
  if (message.toLowerCase().includes('specified key does not exist')) {
    return `${prefix}: some stored files were already missing.`;
  }
  return `${prefix}: ${message}`;
}

async function deleteTenantPrefix(
  client: S3Client,
  bucket: string,
  prefix: string,
): Promise<{ deleted: number; warning?: string }> {
  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    let listed;
    try {
      listed = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
    } catch (error) {
      return { deleted, warning: storageWarning('Storage cleanup skipped', error) };
    }

    const objects = (listed.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key))
      .map((Key) => ({ Key }));

    if (objects.length > 0) {
      try {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        deleted += objects.length;
      } catch (error) {
        return { deleted, warning: storageWarning('Storage cleanup partially skipped', error) };
      }
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  return { deleted };
}

async function deleteTenantUploadedFiles(
  tenantId: string,
): Promise<{ deleted: number; warning?: string }> {
  const bucket = process.env.S3_BUCKET;
  const client = makeClient();
  if (!bucket || !client) {
    return { deleted: 0, warning: 'Storage env is not configured, so uploaded files were not deleted.' };
  }

  const prefixes = [
    `tenants/${tenantId}/receipts/`,
    `tenants/${tenantId}/products/`,
    `tenants/${tenantId}/`,
  ];

  let deleted = 0;
  const warnings: string[] = [];
  for (const prefix of prefixes) {
    const r = await deleteTenantPrefix(client, bucket, prefix);
    deleted += r.deleted;
    if (r.warning) warnings.push(r.warning);
  }
  return { deleted, warning: warnings[0] };
}

/**
 * Hard-delete all operational data for the current tenant.
 * Keeps: company profile, tax profile, brands, locations, domains, FYs,
 * chart of accounts, users/memberships, module settings, POS registers.
 */
async function wipeOperationalData(tenantId: string, userId: string): Promise<number> {
  let tables = 0;

  await withTenantContext(tenantId, async () => {
    await db().transaction(async (tx) => {
      const del = async (label: string, fn: () => Promise<unknown>) => {
        await fn();
        tables += 1;
      };

      // Bank / recon
      await del('bank_statement_lines', () =>
        tx.delete(bankStatementLines).where(eq(bankStatementLines.tenantId, tenantId)),
      );
      await del('bank_statement_imports', () =>
        tx.delete(bankStatementImports).where(eq(bankStatementImports.tenantId, tenantId)),
      );

      // Settlements + commercial lines
      await del('settlement_allocations', () =>
        tx.delete(settlementAllocations).where(eq(settlementAllocations.tenantId, tenantId)),
      );
      await del('sales_invoice_sources', () =>
        tx.delete(salesInvoiceSources).where(eq(salesInvoiceSources.tenantId, tenantId)),
      );
      await del('business_document_lines', () =>
        tx.delete(businessDocumentLines).where(eq(businessDocumentLines.tenantId, tenantId)),
      );

      // Journals before documents/transactions
      await del('journal_lines', () =>
        tx.delete(journalLines).where(eq(journalLines.tenantId, tenantId)),
      );
      await del('business_documents', () =>
        tx.delete(businessDocuments).where(eq(businessDocuments.tenantId, tenantId)),
      );
      await del('journal_entries', () =>
        tx.delete(journalEntries).where(eq(journalEntries.tenantId, tenantId)),
      );

      // Inventory
      await del('inventory_stock_doc_lines', () =>
        tx.delete(inventoryStockDocLines).where(eq(inventoryStockDocLines.tenantId, tenantId)),
      );
      await del('inventory_stock_docs', () =>
        tx.delete(inventoryStockDocs).where(eq(inventoryStockDocs.tenantId, tenantId)),
      );
      await del('inventory_movements', () =>
        tx.delete(inventoryMovements).where(eq(inventoryMovements.tenantId, tenantId)),
      );
      await del('inventory_stock_levels', () =>
        tx.delete(inventoryStockLevels).where(eq(inventoryStockLevels.tenantId, tenantId)),
      );
      await del('inventory_products', () =>
        tx.delete(inventoryProducts).where(eq(inventoryProducts.tenantId, tenantId)),
      );

      // POS activity (keep registers as company setup)
      await del('pos_shifts', () => tx.delete(posShifts).where(eq(posShifts.tenantId, tenantId)));

      // Sales helpers
      await del('tax_invoice_sequences', () =>
        tx.delete(taxInvoiceSequences).where(eq(taxInvoiceSequences.tenantId, tenantId)),
      );
      await del('sales_discounts', () =>
        tx.delete(salesDiscounts).where(eq(salesDiscounts.tenantId, tenantId)),
      );

      // Health checks
      await del('health_check_runs', () =>
        tx.delete(healthCheckRuns).where(eq(healthCheckRuns.tenantId, tenantId)),
      );

      await del('period_locks', () =>
        tx.delete(periodLocks).where(eq(periodLocks.tenantId, tenantId)),
      );
      await del('transactions', () =>
        tx.delete(transactions).where(eq(transactions.tenantId, tenantId)),
      );
      await del('parties', () => tx.delete(parties).where(eq(parties.tenantId, tenantId)));

      // Audit trail of ops — clear then log this reset
      await del('audit_log', () => tx.delete(auditLog).where(eq(auditLog.tenantId, tenantId)));

      await tx.insert(auditLog).values({
        tenantId,
        userId,
        action: 'RESET',
        tableName: 'tenant_operational_data',
        recordId: tenantId,
        newValues: {
          preserved: [
            'tenant',
            'users',
            'memberships',
            'company_profiles',
            'tax_profiles',
            'financial_years',
            'brands',
            'locations',
            'company_domains',
            'chart_of_accounts',
            'sales_settings',
            'purchase_settings',
            'inventory_settings',
            'pos_registers',
          ],
          tablesCleared: tables,
          mode: 'master_wipe',
        },
        notes:
          'Master wipe: all operational ledger/stock/party/document data removed. Company details preserved.',
      });
    });
  });

  return tables;
}

/**
 * Admin / owner reset (legacy confirm: RESET).
 * Full operational wipe, keeps company shell + CoA.
 */
export async function resetCurrentCompanyData(confirmText: string): Promise<ResetCompanyResult> {
  try {
    if (confirmText !== 'RESET' && confirmText !== 'MASTER RESET') {
      return { ok: false, error: 'Type RESET (or MASTER RESET) to confirm.' };
    }

    const user = await requireTenantContext();
    if (!isPrivileged(user)) {
      return { ok: false, error: 'Only admin / owner / super admin can reset company data.' };
    }

    const fileResult = await deleteTenantUploadedFiles(user.tenantId);
    const tablesCleared = await wipeOperationalData(user.tenantId, user.id);

    revalidateAllPaths();

    return {
      ok: true,
      deletedFiles: fileResult.deleted,
      tablesCleared,
      warning: fileResult.warning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reset company data.';
    return { ok: false, error: message };
  }
}

/**
 * Nuclear wipe from ERP Health Check (staging companies only).
 * Confirm phrase: MASTER RESET
 */
export async function masterResetStagingCompanyData(
  confirmText: string,
): Promise<ResetCompanyResult> {
  try {
    if (confirmText !== 'MASTER RESET') {
      return { ok: false, error: 'Type MASTER RESET exactly to confirm full wipe.' };
    }

    const user = await requireTenantContext();
    if (!isPrivileged(user)) {
      return { ok: false, error: 'Only admin / owner / super admin can run master wipe.' };
    }

    const [t] = await db()
      .select({ environment: tenants.environment })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);

    if (t?.environment !== 'staging') {
      return {
        ok: false,
        error:
          'Master wipe is only allowed when this company is marked Staging (Health Check page). Switch to Staging first.',
      };
    }

    const fileResult = await deleteTenantUploadedFiles(user.tenantId);
    const tablesCleared = await wipeOperationalData(user.tenantId, user.id);

    revalidateAllPaths();

    return {
      ok: true,
      deletedFiles: fileResult.deleted,
      tablesCleared,
      warning: fileResult.warning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Master wipe failed.';
    return { ok: false, error: message };
  }
}

function revalidateAllPaths() {
  const paths = [
    '/',
    '/dashboard',
    '/transactions',
    '/journal',
    '/reports',
    '/accounts',
    '/reconciliation',
    '/parties',
    '/documents',
    '/sales/invoices',
    '/sales/orders',
    '/sales/quotations',
    '/sales/returns',
    '/sales/payments',
    '/sales/aging',
    '/purchase/purchases',
    '/purchase/orders',
    '/purchase/receipts',
    '/purchase/returns',
    '/purchase/payments',
    '/inventory/products',
    '/inventory/levels',
    '/inventory/ledger',
    '/inventory/transfers',
    '/inventory/adjustments',
    '/pos',
    '/control-room/health-check',
    '/control-room/modules',
  ];
  for (const p of paths) revalidatePath(p);
}
