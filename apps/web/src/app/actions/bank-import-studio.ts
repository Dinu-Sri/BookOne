'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  buildOverlapReport,
  fileSha256,
  inspectStatementFile,
  loadWorkbookMatrix,
  suggestStudioMapping,
  transformStudioMatrix,
  listColumns,
  type FileInspection,
  type StudioMapping,
  type StudioTransformResult,
  type AmountRules,
} from '@bookone/statement-import';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  bankStatementImportEvents,
  bankStatementImports,
  bankStatementLines,
  bankStatementProfiles,
  bankStatementProfileVersions,
  db,
  desc,
  eq,
  inArray,
  isNull,
  or,
  withTenantContext,
} from '@bookone/db';
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

/**
 * Create a studio draft from uploaded file + initial inspection.
 * Does not write ledger. Does not finalize bank lines.
 */
export async function createStudioDraft(formData: FormData): Promise<
  { ok: true; draft: StudioDraftView } | { ok: false; error: string }
> {
  try {
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

    revalidatePath('/cashbook/import');
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

function parseMappingFromForm(formData: FormData): StudioMapping | null {
  const raw = formData.get('mappingJson');
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const m = JSON.parse(raw) as StudioMapping;
    if (typeof m.headerRowIndex !== 'number') return null;
    if (typeof m.dateCol !== 'number' || typeof m.descriptionCol !== 'number') return null;
    if (!m.amountRules || typeof m.amountRules.mode !== 'string') return null;
    return m;
  } catch {
    return null;
  }
}

export type StudioPreviewPayload = {
  columns: { index: number; label: string; samples: string[] }[];
  suggested: StudioMapping;
  transform: StudioTransformResult;
  sheetName: string;
  headerPreviewRows: string[][];
  /** Full sheet grid for Excel-like UI (capped rows/cols) */
  sheetGrid: string[][];
  /** Absolute 0-based row index of sheetGrid[0] in the workbook matrix */
  sheetGridStartRow: number;
  sheetColCount: number;
  sheetRowCount: number;
  /** Multi-file / period overlap + continuity hints (not blocking) */
  hardeningWarnings: string[];
};

/**
 * Preview transform with current mapping. Client re-sends the file (not stored in DB).
 */
export async function previewStudioTransform(formData: FormData): Promise<
  { ok: true; preview: StudioPreviewPayload } | { ok: false; error: string }
> {
  try {
    const user = await requireTenantContext();
    const file = formData.get('file');
    if (!(file instanceof File)) return { ok: false, error: 'File required for preview.' };

    const bankAccountId = String(formData.get('bankAccountId') ?? '');
    if (!z.string().uuid().safeParse(bankAccountId).success) {
      return { ok: false, error: 'Select a bank account first.' };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sheetName = String(formData.get('sheetName') || '') || undefined;
    const { matrix, sheetName: resolvedSheet } = loadWorkbookMatrix(bytes, file.name, sheetName);
    if (matrix.length === 0) return { ok: false, error: 'No readable rows in this file.' };

    const suggested = suggestStudioMapping(matrix);
    suggested.sheetName = resolvedSheet;
    const mapping = parseMappingFromForm(formData) ?? suggested;
    mapping.sheetName = resolvedSheet;

    // Opening/closing optional overrides
    const openRaw = formData.get('openingBalance');
    const closeRaw = formData.get('closingBalance');
    if (typeof openRaw === 'string' && openRaw.trim() !== '') {
      mapping.openingBalance = Number(openRaw);
    }
    if (typeof closeRaw === 'string' && closeRaw.trim() !== '') {
      mapping.closingBalance = Number(closeRaw);
    }

    const columns = listColumns(matrix, mapping.headerRowIndex);
    const transform = transformStudioMatrix(matrix, mapping, {
      tenantId: user.tenantId,
      bankAccountId,
    });

    const hardeningWarnings = await withTenantContext(user.tenantId, async () => {
      const fps = transform.lines
        .filter((l) => l.validationStatus === 'valid' || l.validationStatus === 'warning')
        .map((l) => l.fingerprint)
        .filter(Boolean);
      const known = new Set<string>();
      for (let i = 0; i < fps.length; i += 400) {
        const chunk = fps.slice(i, i + 400);
        if (chunk.length === 0) continue;
        const rows = await db()
          .select({ fingerprint: bankStatementLines.fingerprint })
          .from(bankStatementLines)
          .where(
            and(
              eq(bankStatementLines.tenantId, user.tenantId),
              isNull(bankStatementLines.voidedAt),
              inArray(bankStatementLines.fingerprint, chunk),
            ),
          );
        for (const r of rows) {
          if (r.fingerprint) known.add(r.fingerprint);
        }
      }
      const prior = await db()
        .select({
          fileName: bankStatementImports.fileName,
          periodFrom: bankStatementImports.periodFrom,
          periodTo: bankStatementImports.periodTo,
        })
        .from(bankStatementImports)
        .where(
          and(
            eq(bankStatementImports.tenantId, user.tenantId),
            eq(bankStatementImports.bankAccountId, bankAccountId),
            isNull(bankStatementImports.voidedAt),
            or(
              inArray(bankStatementImports.wizardStatus, ['committed', 'completed']),
              inArray(bankStatementImports.status, [
                'committed',
                'completed',
                'ready',
                'partial',
              ]),
            ),
          ),
        )
        .orderBy(desc(bankStatementImports.createdAt))
        .limit(12);
      return buildOverlapReport({
        newFingerprints: fps,
        knownFingerprints: known,
        newRange: {
          from: transform.totals.periodFrom,
          to: transform.totals.periodTo,
        },
        priorImports: prior,
      }).warnings;
    });

    // Surface balance-break as preview hardening hint
    const breakIssue = transform.issues.find((i) => i.type === 'balance_break');
    if (breakIssue) {
      hardeningWarnings.unshift(breakIssue.title);
    }

    const headerPreviewRows = matrix
      .slice(Math.max(0, mapping.headerRowIndex - 2), mapping.headerRowIndex + 8)
      .map((row) =>
        (row as unknown[]).slice(0, 8).map((c) => String(c ?? '').trim()),
      );

    const maxCols = Math.min(
      14,
      matrix.reduce((m, r) => Math.max(m, (r as unknown[]).length), 0),
    );
    const maxRows = Math.min(80, matrix.length);
    const sheetGridStartRow = 0;
    const sheetGrid = matrix.slice(0, maxRows).map((row) =>
      Array.from({ length: maxCols }, (_, i) => String((row as unknown[])[i] ?? '').trim()),
    );

    return {
      ok: true,
      preview: {
        columns,
        suggested,
        transform,
        sheetName: resolvedSheet,
        headerPreviewRows,
        sheetGrid,
        sheetGridStartRow,
        sheetColCount: maxCols,
        sheetRowCount: matrix.length,
        hardeningWarnings,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not preview statement.',
    };
  }
}

/**
 * Commit normalized bank lines only — no journal entries.
 */
export async function commitStudioImport(formData: FormData): Promise<
  | {
      ok: true;
      importId: string;
      sessionId?: string;
      lineCount: number;
      duplicateCount: number;
      warnings: string[];
    }
  | { ok: false; error: string }
> {
  try {
    const user = await requireTenantContext();
    const importId = String(formData.get('importId') ?? '');
    if (!z.string().uuid().safeParse(importId).success) {
      return { ok: false, error: 'Missing import draft.' };
    }
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'Re-attach the same bank file to import.' };
    }
    const bankAccountId = String(formData.get('bankAccountId') ?? '');
    if (!z.string().uuid().safeParse(bankAccountId).success) {
      return { ok: false, error: 'Select a bank account.' };
    }
    const mapping = parseMappingFromForm(formData);
    if (!mapping) return { ok: false, error: 'Mapping is incomplete.' };
    const saveProfile = formData.get('saveProfile') === '1';
    const profileName = String(formData.get('profileName') || 'Bank layout').slice(0, 120);
    const idempotencyKey = String(formData.get('idempotencyKey') || `studio-${importId}`);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha = fileSha256(Buffer.from(bytes));
    const sheetName = String(formData.get('sheetName') || mapping.sheetName || '') || undefined;
    const { matrix, sheetName: resolvedSheet } = loadWorkbookMatrix(bytes, file.name, sheetName);
    mapping.sheetName = resolvedSheet;

    const openRaw = formData.get('openingBalance');
    const closeRaw = formData.get('closingBalance');
    if (typeof openRaw === 'string' && openRaw.trim() !== '') {
      mapping.openingBalance = Number(openRaw);
    }
    if (typeof closeRaw === 'string' && closeRaw.trim() !== '') {
      mapping.closingBalance = Number(closeRaw);
    }

    const transform = transformStudioMatrix(matrix, mapping, {
      tenantId: user.tenantId,
      bankAccountId,
    });

    const skipErrorLines = formData.get('skipErrorLines') === '1';
    if (transform.errorCount > 0 && !skipErrorLines) {
      return {
        ok: false,
        error: `Fix ${transform.errorCount} problem(s), or choose “Save good lines only”. ${transform.issues
          .filter((i) => i.severity === 'error')
          .map((i) => i.title)
          .slice(0, 2)
          .join(' · ')}`,
      };
    }
    const readyLines = transform.lines.filter(
      (l) => l.validationStatus === 'valid' || l.validationStatus === 'warning',
    );
    if (readyLines.length === 0) {
      return { ok: false, error: 'No valid transactions to import.' };
    }
    // Only enforce statement balance when both opening & closing were provided
    if (
      !transform.balanceCheck.ok &&
      mapping.openingBalance != null &&
      mapping.closingBalance != null &&
      Number.isFinite(mapping.openingBalance) &&
      Number.isFinite(mapping.closingBalance)
    ) {
      return { ok: false, error: transform.balanceCheck.message };
    }

    const period = (
      transform.totals.periodTo ??
      transform.totals.periodFrom ??
      new Date().toISOString().slice(0, 10)
    ).slice(0, 7);

    const lineCount = await withTenantContext(user.tenantId, async () => {
      const [imp] = await db()
        .select({
          id: bankStatementImports.id,
          wizardStatus: bankStatementImports.wizardStatus,
          draftPayload: bankStatementImports.draftPayload,
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
      if (!imp) throw new Error('Import draft not found.');
      if (imp.wizardStatus === 'committed') {
        throw new Error('This statement was already imported.');
      }

      // Idempotency
      const [byKey] = await db()
        .select({ id: bankStatementImports.id })
        .from(bankStatementImports)
        .where(
          and(
            eq(bankStatementImports.tenantId, user.tenantId),
            eq(bankStatementImports.idempotencyKey, idempotencyKey),
            isNull(bankStatementImports.voidedAt),
          ),
        )
        .limit(1);
      if (byKey && byKey.id !== importId) {
        throw new Error('Duplicate import request.');
      }

      let profileVersionId: string | null = null;
      if (saveProfile) {
        const [profile] = await db()
          .insert(bankStatementProfiles)
          .values({
            tenantId: user.tenantId,
            name: profileName,
            bankHint: profileName.slice(0, 120),
            bankAccountId,
            columnMap: {
              date: mapping.dateCol,
              description: mapping.descriptionCol,
              amount: mapping.amountRules.amountCol ?? '',
              debit: mapping.amountRules.moneyOutCol ?? '',
              credit: mapping.amountRules.moneyInCol ?? '',
              type: mapping.amountRules.typeCol ?? '',
              balance: mapping.balanceCol ?? '',
            },
            signConvention: mapping.amountRules.mode,
            skipRows: mapping.headerRowIndex,
            sheetName: resolvedSheet,
            successCount: 1,
            profileStatus: 'active',
          })
          .returning({ id: bankStatementProfiles.id });

        const [ver] = await db()
          .insert(bankStatementProfileVersions)
          .values({
            tenantId: user.tenantId,
            profileId: profile.id,
            versionNumber: 1,
            status: 'approved',
            columnMappings: {
              dateCol: mapping.dateCol,
              descriptionCol: mapping.descriptionCol,
              balanceCol: mapping.balanceCol ?? null,
              headerRowIndex: mapping.headerRowIndex,
              sheetName: resolvedSheet,
            },
            amountRules: mapping.amountRules as unknown as Record<string, unknown>,
            structureFingerprint: {
              mode: mapping.amountRules.mode,
              headerRow: mapping.headerRowIndex,
              sheet: resolvedSheet,
            },
            createdBy: user.id,
            approvedBy: user.id,
            approvedAt: new Date(),
          })
          .returning({ id: bankStatementProfileVersions.id });

        profileVersionId = ver.id;
        await db()
          .update(bankStatementProfiles)
          .set({ currentVersionId: ver.id, updatedAt: new Date() })
          .where(eq(bankStatementProfiles.id, profile.id));
      }

      // Cross-import fingerprint + period overlap (multi-statement continuity)
      const fps = readyLines.map((l) => l.fingerprint).filter(Boolean);
      const knownFp = new Set<string>();
      for (let i = 0; i < fps.length; i += 400) {
        const chunk = fps.slice(i, i + 400);
        if (chunk.length === 0) continue;
        const found = await db()
          .select({ fingerprint: bankStatementLines.fingerprint })
          .from(bankStatementLines)
          .where(
            and(
              eq(bankStatementLines.tenantId, user.tenantId),
              isNull(bankStatementLines.voidedAt),
              inArray(bankStatementLines.fingerprint, chunk),
            ),
          );
        for (const r of found) {
          if (r.fingerprint) knownFp.add(r.fingerprint);
        }
      }
      const priorImports = await db()
        .select({
          fileName: bankStatementImports.fileName,
          periodFrom: bankStatementImports.periodFrom,
          periodTo: bankStatementImports.periodTo,
        })
        .from(bankStatementImports)
        .where(
          and(
            eq(bankStatementImports.tenantId, user.tenantId),
            eq(bankStatementImports.bankAccountId, bankAccountId),
            isNull(bankStatementImports.voidedAt),
            or(
              inArray(bankStatementImports.wizardStatus, ['committed', 'completed']),
              inArray(bankStatementImports.status, [
                'committed',
                'completed',
                'ready',
                'partial',
              ]),
            ),
          ),
        )
        .orderBy(desc(bankStatementImports.createdAt))
        .limit(20);

      const overlap = buildOverlapReport({
        newFingerprints: fps,
        knownFingerprints: knownFp,
        newRange: {
          from: transform.totals.periodFrom,
          to: transform.totals.periodTo,
        },
        priorImports,
      });

      const fresh = readyLines.filter((l) => !knownFp.has(l.fingerprint));
      const dups = readyLines.filter((l) => knownFp.has(l.fingerprint));
      if (fresh.length === 0 && dups.length > 0) {
        throw new Error(
          'All lines in this file were already imported for this bank. Nothing new to save.',
        );
      }
      if (fresh.length === 0) {
        throw new Error('No valid transactions to import.');
      }

      await db().transaction(async (tx) => {
        // Clear any previous draft lines
        await tx
          .update(bankStatementLines)
          .set({ voidedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(bankStatementLines.importId, importId),
              eq(bankStatementLines.tenantId, user.tenantId),
              isNull(bankStatementLines.voidedAt),
            ),
          );

        for (const line of fresh) {
          await tx.insert(bankStatementLines).values({
            tenantId: user.tenantId,
            importId,
            rowNumber: String(line.rowNumber),
            transactionDate: line.date,
            description: line.description,
            amount: line.signedAmount.toFixed(2),
            status: 'imported',
            raw: line.raw,
            fingerprint: line.fingerprint,
            direction: line.direction,
            balanceAfter:
              line.balanceAfter != null ? line.balanceAfter.toFixed(2) : null,
            debitAmount: line.debitAmount.toFixed(2),
            creditAmount: line.creditAmount.toFixed(2),
            validationStatus: line.validationStatus,
            validationMessages: line.validationMessages,
            sourceRowHash: line.sourceRowHash,
            reconciliationStatus: 'unmatched',
            proposedAction: 'review',
            confidence: line.dateConfidence.toFixed(4),
          });
        }
        for (const line of dups) {
          await tx.insert(bankStatementLines).values({
            tenantId: user.tenantId,
            importId,
            rowNumber: String(line.rowNumber),
            transactionDate: line.date,
            description: line.description,
            amount: line.signedAmount.toFixed(2),
            status: 'duplicate',
            raw: line.raw,
            fingerprint: line.fingerprint,
            direction: line.direction,
            balanceAfter:
              line.balanceAfter != null ? line.balanceAfter.toFixed(2) : null,
            debitAmount: line.debitAmount.toFixed(2),
            creditAmount: line.creditAmount.toFixed(2),
            validationStatus: 'warning',
            validationMessages: [
              ...line.validationMessages,
              'Already imported for this bank (fingerprint match)',
            ],
            sourceRowHash: line.sourceRowHash,
            reconciliationStatus: 'duplicate',
            proposedAction: 'duplicate',
            confidence: line.dateConfidence.toFixed(4),
          });
        }

        const prevPayload = (imp.draftPayload ?? {}) as Record<string, unknown>;
        const hardeningWarnings = [
          ...overlap.warnings,
          ...transform.issues
            .filter((i) => i.severity === 'warning')
            .map((i) => i.title)
            .slice(0, 5),
        ];
        await tx
          .update(bankStatementImports)
          .set({
            status: 'committed',
            wizardStatus: 'committed',
            wizardStep: 'done',
            bankAccountId,
            fileSha256: sha,
            fileName: file.name.slice(0, 255),
            period,
            periodFrom: transform.totals.periodFrom,
            periodTo: transform.totals.periodTo,
            rowCount: String(fresh.length + dups.length),
            matchedCount: '0',
            unmatchedCount: String(fresh.length),
            openingBalance:
              mapping.openingBalance != null ? mapping.openingBalance.toFixed(2) : null,
            closingBalance:
              mapping.closingBalance != null ? mapping.closingBalance.toFixed(2) : null,
            totalMoneyIn: transform.totals.totalMoneyIn.toFixed(2),
            totalMoneyOut: transform.totals.totalMoneyOut.toFixed(2),
            idempotencyKey,
            profileVersionId,
            draftPayload: {
              ...prevPayload,
              mapping,
              committedAt: new Date().toISOString(),
              hardeningWarnings,
              duplicateCount: dups.length,
            },
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bankStatementImports.id, importId),
              eq(bankStatementImports.tenantId, user.tenantId),
            ),
          );

        await tx.insert(bankStatementImportEvents).values({
          tenantId: user.tenantId,
          importId,
          userId: user.id,
          action: 'committed',
          detail: {
            lineCount: fresh.length,
            duplicateCount: dups.length,
            totalMoneyIn: transform.totals.totalMoneyIn,
            totalMoneyOut: transform.totals.totalMoneyOut,
            balanceOk: transform.balanceCheck.ok,
            saveProfile,
            hardeningWarnings,
          },
        });
      });

      return {
        lineCount: fresh.length,
        duplicateCount: dups.length,
        warnings: overlap.warnings,
      };
    });

    // Attach to recon session immediately so inbox shows the bank+period card
    let sessionId: string | undefined;
    try {
      const { getOrCreateSessionFromImport } = await import('@/app/actions/bank-reconciliation');
      const sessionRes = await getOrCreateSessionFromImport(importId);
      if (sessionRes.ok) sessionId = sessionRes.sessionId;
    } catch {
      /* non-fatal — listReconciliationSessions will retry later */
    }

    revalidatePath('/cashbook');
    revalidatePath('/cashbook/import');
    revalidatePath('/cashbook/match');
    revalidatePath('/cashbook/bank-imports');
    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    return {
      ok: true,
      importId,
      sessionId,
      lineCount: lineCount.lineCount,
      duplicateCount: lineCount.duplicateCount,
      warnings: lineCount.warnings,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not import statement.',
    };
  }
}

