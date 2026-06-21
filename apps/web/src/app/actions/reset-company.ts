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
  journalEntries,
  journalLines,
  parties,
  periodLocks,
  settlementAllocations,
  transactions,
  withTenantContext,
} from '@bookone/db';

export interface ResetCompanyResult {
  ok: boolean;
  deletedFiles?: number;
  warning?: string;
  error?: string;
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

async function deleteTenantReceiptFiles(tenantId: string): Promise<{ deleted: number; warning?: string }> {
  const bucket = process.env.S3_BUCKET;
  const client = makeClient();
  if (!bucket || !client) {
    return { deleted: 0, warning: 'Storage env is not configured, so uploaded files were not deleted.' };
  }

  const prefix = `tenants/${tenantId}/receipts/`;
  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const objects = (listed.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key))
      .map((Key) => ({ Key }));

    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects, Quiet: true },
        }),
      );
      deleted += objects.length;
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  return { deleted };
}

export async function resetCurrentCompanyData(confirmText: string): Promise<ResetCompanyResult> {
  try {
    if (confirmText !== 'RESET') {
      return { ok: false, error: 'Type RESET to confirm.' };
    }

    const user = await requireTenantContext();
    if (user.role !== 'admin') {
      return { ok: false, error: 'Only admins can reset company test data.' };
    }

    const fileResult = await deleteTenantReceiptFiles(user.tenantId);

    await withTenantContext(user.tenantId, async () => {
      await db().transaction(async (tx) => {
        await tx.delete(bankStatementLines).where(eq(bankStatementLines.tenantId, user.tenantId));
        await tx.delete(bankStatementImports).where(eq(bankStatementImports.tenantId, user.tenantId));
        await tx.delete(settlementAllocations).where(eq(settlementAllocations.tenantId, user.tenantId));
        await tx.delete(businessDocumentLines).where(eq(businessDocumentLines.tenantId, user.tenantId));
        await tx.delete(journalLines).where(eq(journalLines.tenantId, user.tenantId));
        await tx.delete(businessDocuments).where(eq(businessDocuments.tenantId, user.tenantId));
        await tx.delete(journalEntries).where(eq(journalEntries.tenantId, user.tenantId));
        await tx.delete(periodLocks).where(eq(periodLocks.tenantId, user.tenantId));
        await tx.delete(transactions).where(eq(transactions.tenantId, user.tenantId));
        await tx.delete(parties).where(eq(parties.tenantId, user.tenantId));
        await tx.delete(auditLog).where(eq(auditLog.tenantId, user.tenantId));

        await tx.insert(auditLog).values({
          tenantId: user.tenantId,
          userId: user.id,
          action: 'RESET',
          tableName: 'tenant_operational_data',
          recordId: user.tenantId,
          newValues: {
            preserved: ['tenant', 'users', 'chart_of_accounts'],
            deletedFiles: fileResult.deleted,
          },
          notes: 'Temporary test reset cleared operational company data.',
        });
      });
    });

    revalidatePath('/');
    revalidatePath('/dashboard');
    revalidatePath('/transactions');
    revalidatePath('/journal');
    revalidatePath('/reports');
    revalidatePath('/accounts');
    revalidatePath('/reconciliation');
    revalidatePath('/parties');
    revalidatePath('/documents');

    return { ok: true, deletedFiles: fileResult.deleted, warning: fileResult.warning };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reset company data.';
    return { ok: false, error: message };
  }
}
