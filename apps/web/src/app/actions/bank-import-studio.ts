'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fileSha256, inspectStatementFile, type FileInspection } from '@bookone/statement-import';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  bankStatementImportEvents,
  bankStatementImports,
  db,
  desc,
  eq,
  isNull,
  withTenantContext,
} from '@bookone/db';
import { isBankImportStudioEnabled } from '@/lib/bank-import-studio-flag';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = /\.(xlsx|xls|csv|tsv|txt)$/i;

export type StudioDraftView = {
  id: string;
  fileName: string;
  wizardStatus: string;
  wizardStep: string | null;
  draftVersion: number;
  bankAccountId: string | null;
  bookDomain: string | null;
  draftPayload: Record<string, unknown> | null;
  inspection: FileInspection | null;
  fileSha256: string | null;
  period: string;
};

function assertStudioEnabled() {
  if (!isBankImportStudioEnabled()) {
    throw new Error('Bank Import Studio is not enabled. Set BANK_IMPORT_STUDIO=1.');
  }
}

/**
 * Create a studio draft from uploaded file + initial inspection.
 * Does not write ledger. Does not finalize bank lines.
 */
export async function createStudioDraft(formData: FormData): Promise<
  { ok: true; draft: StudioDraftView } | { ok: false; error: string }
> {
  try {
    assertStudioEnabled();
    const user = await requireTenantContext();
    const file = formData.get('file');
    const bankAccountIdRaw = String(formData.get('bankAccountId') ?? '');
    const bookDomainRaw = formData.get('bookDomain');
    const bookDomain =
      bookDomainRaw === 'personal' || bookDomainRaw === 'business' ? bookDomainRaw : null;
    const source = String(formData.get('source') ?? 'cashbook');

    if (!(file instanceof File)) {
      return { ok: false, error: 'Choose an Excel or CSV file from your bank.' };
    }
    if (!ALLOWED.test(file.name)) {
      return { ok: false, error: 'Use .xlsx, .xls, or .csv.' };
    }
    if (file.size <= 0) return { ok: false, error: 'File is empty.' };
    if (file.size > MAX_BYTES) {
      return { ok: false, error: 'File is too large (max 20 MB). Prefer monthly statements.' };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha = fileSha256(Buffer.from(bytes));
    const inspection = inspectStatementFile(Buffer.from(bytes), file.name);

    if (inspection.warnings.some((w) => w.includes('could not read'))) {
      return { ok: false, error: inspection.warnings[0]! };
    }

    const bankAccountId = z.string().uuid().safeParse(bankAccountIdRaw).success
      ? bankAccountIdRaw
      : null;

    // Exact file re-upload → return existing draft/committed
    const existing = await withTenantContext(user.tenantId, async () => {
      if (!bankAccountId) return null;
      const [row] = await db()
        .select({
          id: bankStatementImports.id,
          fileName: bankStatementImports.fileName,
          wizardStatus: bankStatementImports.wizardStatus,
          wizardStep: bankStatementImports.wizardStep,
          draftVersion: bankStatementImports.draftVersion,
          bankAccountId: bankStatementImports.bankAccountId,
          bookDomain: bankStatementImports.bookDomain,
          draftPayload: bankStatementImports.draftPayload,
          fileSha256: bankStatementImports.fileSha256,
          period: bankStatementImports.period,
        })
        .from(bankStatementImports)
        .where(
          and(
            eq(bankStatementImports.tenantId, user.tenantId),
            eq(bankStatementImports.bankAccountId, bankAccountId),
            eq(bankStatementImports.fileSha256, sha),
            isNull(bankStatementImports.voidedAt),
          ),
        )
        .orderBy(desc(bankStatementImports.createdAt))
        .limit(1);
      return row ?? null;
    });

    if (existing) {
      const payload = (existing.draftPayload ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        draft: {
          id: existing.id,
          fileName: existing.fileName,
          wizardStatus: existing.wizardStatus ?? 'draft',
          wizardStep: existing.wizardStep,
          draftVersion: existing.draftVersion ?? 1,
          bankAccountId: existing.bankAccountId,
          bookDomain: existing.bookDomain,
          draftPayload: payload,
          inspection: (payload.inspection as FileInspection) ?? inspection,
          fileSha256: existing.fileSha256,
          period: existing.period,
        },
      };
    }

    const best = inspection.sheets[0];
    const period = (best?.dateTo ?? best?.dateFrom ?? new Date().toISOString().slice(0, 10)).slice(
      0,
      7,
    );

    // Do not store raw file bytes in Postgres (20MB statements). Object storage in BIS-4.
    // Inspection samples + later re-upload or storage_key will feed transform.
    const draftPayload = {
      inspection,
      bankAccountId,
      bookDomain,
      sheetName: inspection.bestSheetName,
      step: bankAccountId ? 'sheet' : 'account',
      fileSize: file.size,
    };

    const created = await withTenantContext(user.tenantId, async () => {
      const [row] = await db()
        .insert(bankStatementImports)
        .values({
          tenantId: user.tenantId,
          userId: user.id,
          period,
          fileName: file.name.slice(0, 255),
          status: 'draft',
          rowCount: '0',
          matchedCount: '0',
          unmatchedCount: '0',
          bankAccountId,
          bookDomain,
          fileSha256: sha,
          periodFrom: best?.dateFrom ?? null,
          periodTo: best?.dateTo ?? null,
          source: source === 'erp_recon' ? 'erp_recon' : 'cashbook',
          wizardStatus: 'draft',
          wizardStep: bankAccountId ? 'sheet' : 'account',
          draftPayload,
          draftVersion: 1,
          metadata: {
            studio: true,
            format: inspection.format,
            sheetCount: inspection.sheetNames.length,
          },
        })
        .returning({
          id: bankStatementImports.id,
          fileName: bankStatementImports.fileName,
          wizardStatus: bankStatementImports.wizardStatus,
          wizardStep: bankStatementImports.wizardStep,
          draftVersion: bankStatementImports.draftVersion,
          bankAccountId: bankStatementImports.bankAccountId,
          bookDomain: bankStatementImports.bookDomain,
          draftPayload: bankStatementImports.draftPayload,
          fileSha256: bankStatementImports.fileSha256,
          period: bankStatementImports.period,
        });

      await db().insert(bankStatementImportEvents).values({
        tenantId: user.tenantId,
        importId: row.id,
        userId: user.id,
        action: 'inspect',
        detail: {
          fileName: file.name,
          sheets: inspection.sheetNames,
          bestSheet: inspection.bestSheetName,
          warnings: inspection.warnings,
        },
      });

      return row;
    });

    revalidatePath('/cashbook/import-studio');
    return {
      ok: true,
      draft: {
        id: created.id,
        fileName: created.fileName,
        wizardStatus: created.wizardStatus ?? 'draft',
        wizardStep: created.wizardStep,
        draftVersion: created.draftVersion ?? 1,
        bankAccountId: created.bankAccountId,
        bookDomain: created.bookDomain,
        draftPayload: (created.draftPayload ?? {}) as Record<string, unknown>,
        inspection,
        fileSha256: created.fileSha256,
        period: created.period,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not start import.',
    };
  }
}

export async function saveStudioDraftStep(input: {
  importId: string;
  expectedDraftVersion: number;
  wizardStep: string;
  patch: Record<string, unknown>;
}): Promise<{ ok: true; draftVersion: number } | { ok: false; error: string }> {
  try {
    assertStudioEnabled();
    const user = await requireTenantContext();
    const importId = z.string().uuid().parse(input.importId);
    const expected = z.number().int().positive().parse(input.expectedDraftVersion);

    const result = await withTenantContext(user.tenantId, async () => {
      const [row] = await db()
        .select({
          id: bankStatementImports.id,
          draftVersion: bankStatementImports.draftVersion,
          draftPayload: bankStatementImports.draftPayload,
          wizardStatus: bankStatementImports.wizardStatus,
        })
        .from(bankStatementImports)
        .where(
          and(
            eq(bankStatementImports.id, importId),
            eq(bankStatementImports.tenantId, user.tenantId),
            isNull(bankStatementImports.voidedAt),
          ),
        )
        .limit(1);
      if (!row) throw new Error('Import draft not found.');
      if (row.wizardStatus === 'committed') {
        throw new Error('This statement is already imported.');
      }
      if ((row.draftVersion ?? 1) !== expected) {
        throw new Error('This draft was updated elsewhere. Reload and try again.');
      }

      const prev = (row.draftPayload ?? {}) as Record<string, unknown>;
      // Never grow payload with huge binary on every patch — strip if present in patch
      const { bytesBase64: _drop, ...safePatch } = input.patch as Record<string, unknown> & {
        bytesBase64?: string;
      };
      const nextPayload = { ...prev, ...safePatch };
      const nextVersion = expected + 1;

      await db()
        .update(bankStatementImports)
        .set({
          draftPayload: nextPayload,
          draftVersion: nextVersion,
          wizardStep: input.wizardStep.slice(0, 40),
          wizardStatus: 'draft',
          bankAccountId:
            typeof safePatch.bankAccountId === 'string' &&
            z.string().uuid().safeParse(safePatch.bankAccountId).success
              ? (safePatch.bankAccountId as string)
              : undefined,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bankStatementImports.id, importId),
            eq(bankStatementImports.tenantId, user.tenantId),
          ),
        );

      await db().insert(bankStatementImportEvents).values({
        tenantId: user.tenantId,
        importId,
        userId: user.id,
        action: 'step_saved',
        detail: { step: input.wizardStep, draftVersion: nextVersion },
      });

      return nextVersion;
    });

    return { ok: true, draftVersion: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save draft.' };
  }
}

export async function getStudioDraft(
  importId: string,
): Promise<StudioDraftView | null> {
  if (!isBankImportStudioEnabled()) return null;
  const user = await requireTenantContext();
  if (!z.string().uuid().safeParse(importId).success) return null;

  return withTenantContext(user.tenantId, async () => {
    const [row] = await db()
      .select({
        id: bankStatementImports.id,
        fileName: bankStatementImports.fileName,
        wizardStatus: bankStatementImports.wizardStatus,
        wizardStep: bankStatementImports.wizardStep,
        draftVersion: bankStatementImports.draftVersion,
        bankAccountId: bankStatementImports.bankAccountId,
        bookDomain: bankStatementImports.bookDomain,
        draftPayload: bankStatementImports.draftPayload,
        fileSha256: bankStatementImports.fileSha256,
        period: bankStatementImports.period,
      })
      .from(bankStatementImports)
      .where(
        and(
          eq(bankStatementImports.id, importId),
          eq(bankStatementImports.tenantId, user.tenantId),
          isNull(bankStatementImports.voidedAt),
        ),
      )
      .limit(1);
    if (!row) return null;
    const payload = (row.draftPayload ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      fileName: row.fileName,
      wizardStatus: row.wizardStatus ?? 'draft',
      wizardStep: row.wizardStep,
      draftVersion: row.draftVersion ?? 1,
      bankAccountId: row.bankAccountId,
      bookDomain: row.bookDomain,
      draftPayload: payload,
      inspection: (payload.inspection as FileInspection) ?? null,
      fileSha256: row.fileSha256,
      period: row.period,
    };
  });
}
