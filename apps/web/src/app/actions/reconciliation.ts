'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import {
  auditLog,
  bankStatementImports,
  bankStatementLines,
  db,
  eq,
  and,
  isNull,
  desc,
  inArray,
  periodLocks,
  transactions,
  withTenantContext,
} from '@bookone/db';

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);

const importLineSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(1000),
  amount: z.number(),
  matchedTransactionId: z.string().uuid().nullable().optional(),
  status: z.enum(['matched', 'reconciled', 'unmatched', 'review']).default('review'),
  raw: z.record(z.unknown()).optional(),
});

const createImportSchema = z.object({
  period: periodSchema,
  fileName: z.string().min(1).max(255),
  rows: z.array(importLineSchema).min(1).max(1000),
});

const updateLineSchema = z.object({
  lineId: z.string().uuid(),
  status: z.enum(['matched', 'reconciled', 'unmatched', 'review']),
  matchedTransactionId: z.string().uuid().nullable().optional(),
});

export interface PersistedStatementLine {
  id: string;
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  status: string;
  matchedTransactionId: string | null;
}

export interface ReconciliationImportSummary {
  id: string;
  period: string;
  fileName: string;
  status: string;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  createdAt: string;
  lines: PersistedStatementLine[];
}

export interface PeriodLockInfo {
  id: string;
  period: string;
  status: string;
  lockedAt: string;
  notes: string | null;
}

function summarizeLines(rows: { status: string }[]) {
  const matchedCount = rows.filter((row) => row.status === 'matched' || row.status === 'reconciled').length;
  return {
    matchedCount,
    unmatchedCount: rows.length - matchedCount,
  };
}

async function refreshImportCounts(importId: string, tenantId: string) {
  const rows = await db()
    .select({ status: bankStatementLines.status })
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.tenantId, tenantId),
        eq(bankStatementLines.importId, importId),
        isNull(bankStatementLines.voidedAt),
      ),
    );
  const summary = summarizeLines(rows);
  await db()
    .update(bankStatementImports)
    .set({
      rowCount: rows.length.toString(),
      matchedCount: summary.matchedCount.toString(),
      unmatchedCount: summary.unmatchedCount.toString(),
      updatedAt: new Date(),
    })
    .where(and(eq(bankStatementImports.tenantId, tenantId), eq(bankStatementImports.id, importId)));
}

export async function getReconciliationForPeriod(period: string): Promise<{
  importSummary: ReconciliationImportSummary | null;
  lock: PeriodLockInfo | null;
}> {
  const parsedPeriod = periodSchema.parse(period);
  const user = await requireTenantContext();

  return withTenantContext(user.tenantId, async () => {
    const [importRow] = await db()
      .select({
        id: bankStatementImports.id,
        period: bankStatementImports.period,
        fileName: bankStatementImports.fileName,
        status: bankStatementImports.status,
        rowCount: bankStatementImports.rowCount,
        matchedCount: bankStatementImports.matchedCount,
        unmatchedCount: bankStatementImports.unmatchedCount,
        createdAt: bankStatementImports.createdAt,
      })
      .from(bankStatementImports)
      .where(
        and(
          eq(bankStatementImports.tenantId, user.tenantId),
          eq(bankStatementImports.period, parsedPeriod),
          isNull(bankStatementImports.voidedAt),
        ),
      )
      .orderBy(desc(bankStatementImports.createdAt))
      .limit(1);

    const lines = importRow
      ? await db()
          .select({
            id: bankStatementLines.id,
            rowNumber: bankStatementLines.rowNumber,
            date: bankStatementLines.transactionDate,
            description: bankStatementLines.description,
            amount: bankStatementLines.amount,
            status: bankStatementLines.status,
            matchedTransactionId: bankStatementLines.matchedTransactionId,
          })
          .from(bankStatementLines)
          .where(
            and(
              eq(bankStatementLines.tenantId, user.tenantId),
              eq(bankStatementLines.importId, importRow.id),
              isNull(bankStatementLines.voidedAt),
            ),
          )
      : [];

    const [lockRow] = await db()
      .select({
        id: periodLocks.id,
        period: periodLocks.period,
        status: periodLocks.status,
        lockedAt: periodLocks.lockedAt,
        notes: periodLocks.notes,
      })
      .from(periodLocks)
      .where(
        and(
          eq(periodLocks.tenantId, user.tenantId),
          eq(periodLocks.period, parsedPeriod),
          eq(periodLocks.status, 'locked'),
          isNull(periodLocks.voidedAt),
        ),
      )
      .limit(1);

    return {
      importSummary: importRow
        ? {
            id: importRow.id,
            period: importRow.period,
            fileName: importRow.fileName,
            status: importRow.status,
            rowCount: Number(importRow.rowCount),
            matchedCount: Number(importRow.matchedCount),
            unmatchedCount: Number(importRow.unmatchedCount),
            createdAt: importRow.createdAt.toISOString(),
            lines: lines.map((line) => ({
              id: line.id,
              rowNumber: Number(line.rowNumber),
              date: line.date,
              description: line.description,
              amount: Number(line.amount),
              status: line.status,
              matchedTransactionId: line.matchedTransactionId,
            })),
          }
        : null,
      lock: lockRow
        ? {
            id: lockRow.id,
            period: lockRow.period,
            status: lockRow.status,
            lockedAt: lockRow.lockedAt.toISOString(),
            notes: lockRow.notes,
          }
        : null,
    };
  });
}

export async function createBankStatementImport(input: z.infer<typeof createImportSchema>): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = createImportSchema.parse(input);
    const user = await requireTenantContext();

    await withTenantContext(user.tenantId, async () => {
      const transactionIds = parsed.rows
        .map((row) => row.matchedTransactionId)
        .filter((id): id is string => Boolean(id));
      if (transactionIds.length > 0) {
        const owned = await db()
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.tenantId, user.tenantId),
              isNull(transactions.voidedAt),
              inArray(transactions.id, transactionIds),
            ),
          );
        const ownedIds = new Set(owned.map((row) => row.id));
        if (transactionIds.some((id) => !ownedIds.has(id))) {
          throw new Error('One or more matched transactions do not belong to this tenant.');
        }
      }

      const summary = summarizeLines(parsed.rows);
      await db().transaction(async (tx) => {
        const [createdImport] = await tx
          .insert(bankStatementImports)
          .values({
            tenantId: user.tenantId,
            userId: user.id,
            period: parsed.period,
            fileName: parsed.fileName,
            rowCount: parsed.rows.length.toString(),
            matchedCount: summary.matchedCount.toString(),
            unmatchedCount: summary.unmatchedCount.toString(),
            metadata: { source: 'csv-upload' },
          })
          .returning({ id: bankStatementImports.id });

        for (const [index, row] of parsed.rows.entries()) {
          await tx.insert(bankStatementLines).values({
            tenantId: user.tenantId,
            importId: createdImport.id,
            matchedTransactionId: row.matchedTransactionId ?? null,
            rowNumber: (index + 1).toString(),
            transactionDate: row.date,
            description: row.description,
            amount: row.amount.toString(),
            status: row.status,
            raw: row.raw ?? null,
            reviewedByUserId: row.status === 'review' ? null : user.id,
            reviewedAt: row.status === 'review' ? null : new Date(),
          });
        }

        await tx.insert(auditLog).values({
          tenantId: user.tenantId,
          userId: user.id,
          action: 'IMPORT',
          tableName: 'bank_statement_imports',
          recordId: createdImport.id,
          newValues: {
            period: parsed.period,
            fileName: parsed.fileName,
            rowCount: parsed.rows.length,
            matchedCount: summary.matchedCount,
            unmatchedCount: summary.unmatchedCount,
          },
          notes: 'Imported bank statement CSV for reconciliation.',
        });
      });
    });

    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not import bank statement.';
    return { ok: false, error: message };
  }
}

export async function updateBankStatementLineStatus(input: z.infer<typeof updateLineSchema>): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = updateLineSchema.parse(input);
    const user = await requireTenantContext();

    await withTenantContext(user.tenantId, async () => {
      const [line] = await db()
        .select({ id: bankStatementLines.id, importId: bankStatementLines.importId })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.tenantId, user.tenantId),
            eq(bankStatementLines.id, parsed.lineId),
            isNull(bankStatementLines.voidedAt),
          ),
        )
        .limit(1);
      if (!line) throw new Error('Statement line not found.');

      await db()
        .update(bankStatementLines)
        .set({
          status: parsed.status,
          matchedTransactionId: Object.prototype.hasOwnProperty.call(parsed, 'matchedTransactionId')
            ? parsed.matchedTransactionId ?? null
            : undefined,
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(bankStatementLines.tenantId, user.tenantId), eq(bankStatementLines.id, parsed.lineId)));

      await refreshImportCounts(line.importId, user.tenantId);
    });

    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update statement line.';
    return { ok: false, error: message };
  }
}

export async function lockPeriod(period: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsedPeriod = periodSchema.parse(period);
    const user = await requireTenantContext();

    await withTenantContext(user.tenantId, async () => {
      const [latestImport] = await db()
        .select({ id: bankStatementImports.id })
        .from(bankStatementImports)
        .where(
          and(
            eq(bankStatementImports.tenantId, user.tenantId),
            eq(bankStatementImports.period, parsedPeriod),
            isNull(bankStatementImports.voidedAt),
          ),
        )
        .orderBy(desc(bankStatementImports.createdAt))
        .limit(1);
      if (!latestImport) {
        throw new Error('Upload and review a bank statement before locking this period.');
      }

      const reviewRows = await db()
        .select({ id: bankStatementLines.id })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.tenantId, user.tenantId),
            eq(bankStatementLines.importId, latestImport.id),
            eq(bankStatementLines.status, 'review'),
            isNull(bankStatementLines.voidedAt),
          ),
        )
        .limit(1);
      if (reviewRows.length > 0) {
        throw new Error('Review all statement lines before locking this period.');
      }

      const [existing] = await db()
        .select({ id: periodLocks.id })
        .from(periodLocks)
        .where(
          and(
            eq(periodLocks.tenantId, user.tenantId),
            eq(periodLocks.period, parsedPeriod),
            eq(periodLocks.status, 'locked'),
            isNull(periodLocks.voidedAt),
          ),
        )
        .limit(1);
      if (existing) return;

      const [createdLock] = await db()
        .insert(periodLocks)
        .values({
          tenantId: user.tenantId,
          userId: user.id,
          period: parsedPeriod,
          notes: 'Locked from reconciliation workflow.',
        })
        .returning({ id: periodLocks.id });

      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'LOCK',
        tableName: 'period_locks',
        recordId: createdLock.id,
        newValues: { period: parsedPeriod, status: 'locked' },
        notes: 'Locked accounting period.',
      });
    });

    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not lock period.';
    return { ok: false, error: message };
  }
}
