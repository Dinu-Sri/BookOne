'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  annotateBalanceContinuity,
  fileSha256,
  matchAll,
  parseStatementFile,
  previewStatementSheet,
  applyPresetToHeaders,
  getPreset,
  listPresetsForUi,
  suggestPresetFromBankName,
  type BookCandidate,
  type CanonicalStatementLine,
  type MatchResult,
  type ParseProfile,
  type ProposedAction,
  type SheetPreview,
  type SignConvention,
  type SlBankPresetId,
} from '@bookone/statement-import';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  and,
  auditLog,
  bankStatementImportEvents,
  bankStatementImports,
  bankStatementLines,
  bankStatementProfiles,
  db,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  periodLocks,
  transactions,
  withTenantContext,
  desc,
  sql,
} from '@bookone/db';
import { recordEntry, reverseTransactionById } from '@/app/actions/record-entry';
import { randomUUID } from 'node:crypto';

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_BATCH_FILES = 24;
const ALLOWED_EXT = /\.(xlsx|xls|csv|txt)$/i;

const sourceSchema = z.enum(['cashbook', 'erp_recon']);

export type MatchCandidateView = {
  id: string;
  score: number;
  date?: string;
  description?: string;
  amountSigned?: number;
};

export type StatementLineView = {
  id: string;
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  direction: string | null;
  status: string;
  proposedAction: string;
  matchScore: number | null;
  matchMethod: string | null;
  matchedTransactionId: string | null;
  createdTransactionId: string | null;
  confidence: number | null;
  fingerprint: string | null;
  externalRef: string | null;
  candidates: MatchCandidateView[];
  /** SI-4 flags e.g. BALANCE_BREAK */
  flags: string[];
  month: string;
};

export type MatchPassStats = {
  link: number;
  review: number;
  create: number;
  leftAlone: number;
  total: number;
};

export type StatementImportView = {
  id: string;
  period: string;
  periodFrom: string | null;
  periodTo: string | null;
  fileName: string;
  status: string;
  bankAccountId: string | null;
  bankAccountCode: string | null;
  bankAccountName: string | null;
  bookDomain: string | null;
  source: string | null;
  fileSha256: string | null;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  warnings: string[];
  multiMonth: boolean;
  batchId: string | null;
  profileName: string | null;
  profileLearned: boolean;
  months: string[];
  lines: StatementLineView[];
  counts: {
    link: number;
    create: number;
    review: number;
    duplicate: number;
    skip: number;
    linked: number;
    created: number;
    skipped: number;
    balanceBreaks: number;
  };
};

export type StatementBatchItem = {
  importId: string;
  fileName: string;
  reused: boolean;
  error?: string;
  rowCount?: number;
  periodFrom?: string | null;
  periodTo?: string | null;
};

export type StatementBatchView = {
  batchId: string;
  bankAccountId: string;
  items: StatementBatchItem[];
  imports: StatementImportView[];
};

function mapActionToStatus(action: ProposedAction, hasMatch: boolean): string {
  if (action === 'link' && hasMatch) return 'matched';
  if (action === 'duplicate') return 'duplicate';
  if (action === 'skip') return 'skipped';
  if (action === 'create') return 'unmatched';
  return 'review';
}

function bookSignedAmount(
  direction: string,
  amount: number,
  paymentAccountId: string,
  transferSourceAccountId: string | null,
  bankAccountId: string,
): number | null {
  if (direction === 'money_in' && paymentAccountId === bankAccountId) return amount;
  if (direction === 'money_out' && paymentAccountId === bankAccountId) return -amount;
  if (direction === 'move_money') {
    if (paymentAccountId === bankAccountId) return amount; // into this bank
    if (transferSourceAccountId === bankAccountId) return -amount; // out of this bank
  }
  // Invoice/bill without cash movement usually not on bank statement
  return null;
}

async function loadBookCandidates(
  tenantId: string,
  bankAccountId: string,
  periodFrom: string | null,
  periodTo: string | null,
  bookDomain: string | null | undefined,
): Promise<BookCandidate[]> {
  const from = periodFrom
    ? new Date(`${periodFrom}T12:00:00`)
    : new Date();
  const to = periodTo ? new Date(`${periodTo}T12:00:00`) : new Date();
  from.setDate(from.getDate() - 5);
  to.setDate(to.getDate() + 5);
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = to.toISOString().slice(0, 10);

  const rows = await db()
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      direction: transactions.direction,
      paymentAccountId: transactions.paymentAccountId,
      transferSourceAccountId: transactions.transferSourceAccountId,
      bookDomain: transactions.bookDomain,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.tenantId, tenantId),
        isNull(transactions.voidedAt),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo),
        or(
          eq(transactions.paymentAccountId, bankAccountId),
          eq(transactions.transferSourceAccountId, bankAccountId),
        ),
      ),
    )
    .orderBy(desc(transactions.date));

  const out: BookCandidate[] = [];
  for (const r of rows) {
    if (bookDomain && r.bookDomain && r.bookDomain !== bookDomain) continue;
    const signed = bookSignedAmount(
      r.direction,
      Number(r.amount),
      r.paymentAccountId,
      r.transferSourceAccountId,
      bankAccountId,
    );
    if (signed == null) continue;
    out.push({
      id: r.id,
      date: r.date,
      description: r.description,
      amountSigned: signed,
    });
  }
  return out;
}

async function existingFingerprints(
  tenantId: string,
  fingerprints: string[],
): Promise<Set<string>> {
  if (fingerprints.length === 0) return new Set();
  const found = new Set<string>();
  // chunk to avoid huge IN lists
  for (let i = 0; i < fingerprints.length; i += 400) {
    const chunk = fingerprints.slice(i, i + 400);
    const rows = await db()
      .select({ fingerprint: bankStatementLines.fingerprint })
      .from(bankStatementLines)
      .where(
        and(
          eq(bankStatementLines.tenantId, tenantId),
          isNull(bankStatementLines.voidedAt),
          inArray(bankStatementLines.fingerprint, chunk),
        ),
      );
    for (const r of rows) {
      if (r.fingerprint) found.add(r.fingerprint);
    }
  }
  return found;
}

function countBy(
  lines: { proposedAction: string | null; status: string; flags?: string[] }[],
) {
  const c = {
    link: 0,
    create: 0,
    review: 0,
    duplicate: 0,
    skip: 0,
    linked: 0,
    created: 0,
    skipped: 0,
    balanceBreaks: 0,
  };
  for (const l of lines) {
    const pa = l.proposedAction ?? 'review';
    if (l.flags?.includes('BALANCE_BREAK')) c.balanceBreaks += 1;
    if (l.status === 'reconciled' || l.status === 'matched') c.linked += 1;
    else if (l.status === 'created') c.created += 1;
    else if (l.status === 'skipped' || l.status === 'duplicate') c.skipped += 1;
    else if (pa === 'link') c.link += 1;
    else if (pa === 'create') c.create += 1;
    else if (pa === 'duplicate') c.duplicate += 1;
    else if (pa === 'skip') c.skip += 1;
    else c.review += 1;
  }
  return c;
}

function extractFlags(raw: unknown, notes: string | null | undefined): string[] {
  const flags: string[] = [];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { _flags?: unknown })._flags)) {
    for (const f of (raw as { _flags: unknown[] })._flags) {
      if (typeof f === 'string') flags.push(f);
    }
  }
  if (notes?.includes('BALANCE_BREAK') && !flags.includes('BALANCE_BREAK')) {
    flags.push('BALANCE_BREAK');
  }
  return flags;
}

function toLineView(
  row: {
    id: string;
    rowNumber: string | number;
    transactionDate: string;
    description: string;
    amount: string | number;
    direction: string | null;
    status: string;
    proposedAction: string | null;
    matchScore: string | number | null;
    matchMethod: string | null;
    matchedTransactionId: string | null;
    createdTransactionId: string | null;
    confidence: string | number | null;
    fingerprint: string | null;
    externalRef: string | null;
    matchCandidates: unknown;
    raw?: unknown;
    notes?: string | null;
  },
  bookById?: Map<string, { date: string; description: string; amountSigned: number }>,
): StatementLineView {
  const rawCandidates = Array.isArray(row.matchCandidates)
    ? (row.matchCandidates as { id: string; score: number }[])
    : [];
  const candidates: MatchCandidateView[] = rawCandidates.map((c) => {
    const book = bookById?.get(c.id);
    return {
      id: c.id,
      score: c.score,
      date: book?.date,
      description: book?.description,
      amountSigned: book?.amountSigned,
    };
  });
  const flags = extractFlags(row.raw, row.notes);
  return {
    id: row.id,
    rowNumber: Number(row.rowNumber),
    date: row.transactionDate,
    description: row.description,
    amount: Number(row.amount),
    direction: row.direction,
    status: row.status,
    proposedAction: row.proposedAction ?? 'review',
    matchScore: row.matchScore != null ? Number(row.matchScore) : null,
    matchMethod: row.matchMethod,
    matchedTransactionId: row.matchedTransactionId,
    createdTransactionId: row.createdTransactionId,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    fingerprint: row.fingerprint,
    externalRef: row.externalRef,
    candidates,
    flags,
    month: row.transactionDate.slice(0, 7),
  };
}

async function loadBestProfile(
  tenantId: string,
  bankName: string,
): Promise<{ id: string; profile: ParseProfile } | null> {
  const hint = bankName.trim().toLowerCase();
  const rows = await db()
    .select({
      id: bankStatementProfiles.id,
      name: bankStatementProfiles.name,
      bankHint: bankStatementProfiles.bankHint,
      columnMap: bankStatementProfiles.columnMap,
      signConvention: bankStatementProfiles.signConvention,
      dateFormatHint: bankStatementProfiles.dateFormatHint,
      skipRows: bankStatementProfiles.skipRows,
      sheetName: bankStatementProfiles.sheetName,
      successCount: bankStatementProfiles.successCount,
    })
    .from(bankStatementProfiles)
    .where(
      and(
        or(eq(bankStatementProfiles.tenantId, tenantId), isNull(bankStatementProfiles.tenantId)),
        isNull(bankStatementProfiles.voidedAt),
      ),
    )
    .orderBy(desc(bankStatementProfiles.successCount));

  if (rows.length === 0) return null;

  const scored = rows
    .map((r) => {
      const rh = (r.bankHint ?? r.name ?? '').toLowerCase();
      let score = r.successCount ?? 0;
      if (hint && rh && (hint.includes(rh) || rh.includes(hint))) score += 1000;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.r;
  if (!best || (best.successCount ?? 0) <= 0 && !best.bankHint) {
    // still allow if bank_hint matches even with 0 success
    const byHint = scored.find(
      (s) => s.score >= 1000 && Object.keys(s.r.columnMap ?? {}).length > 0,
    );
    if (!byHint) return null;
    const p = byHint.r;
    return {
      id: p.id,
      profile: {
        name: p.name,
        bankHint: p.bankHint ?? undefined,
        columnMap: (p.columnMap ?? {}) as ParseProfile['columnMap'],
        signConvention: (p.signConvention as ParseProfile['signConvention']) || 'debit_credit',
        dateFormatHint: p.dateFormatHint ?? undefined,
        skipRows: p.skipRows ?? 0,
        sheetName: p.sheetName ?? undefined,
      },
    };
  }

  if (Object.keys(best.columnMap ?? {}).length === 0) return null;

  return {
    id: best.id,
    profile: {
      name: best.name,
      bankHint: best.bankHint ?? undefined,
      columnMap: (best.columnMap ?? {}) as ParseProfile['columnMap'],
      signConvention: (best.signConvention as ParseProfile['signConvention']) || 'debit_credit',
      dateFormatHint: best.dateFormatHint ?? undefined,
      skipRows: best.skipRows ?? 0,
      sheetName: best.sheetName ?? undefined,
    },
  };
}

/** Persist / bump learned layout after a successful import pass. */
async function learnProfileFromImport(
  tenantId: string,
  importId: string,
): Promise<void> {
  const [imp] = await db()
    .select({
      id: bankStatementImports.id,
      bankAccountId: bankStatementImports.bankAccountId,
      parserProfileId: bankStatementImports.parserProfileId,
      metadata: bankStatementImports.metadata,
    })
    .from(bankStatementImports)
    .where(
      and(
        eq(bankStatementImports.id, importId),
        eq(bankStatementImports.tenantId, tenantId),
        isNull(bankStatementImports.voidedAt),
      ),
    )
    .limit(1);
  if (!imp) return;

  const meta = (imp.metadata ?? {}) as {
    profileName?: string;
    profileAuto?: boolean;
    bankName?: string;
    columnMap?: Record<string, string | number>;
    signConvention?: string;
    skipRows?: number;
    sheetName?: string;
  };

  if (imp.parserProfileId) {
    await db()
      .update(bankStatementProfiles)
      .set({
        successCount: sql`${bankStatementProfiles.successCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bankStatementProfiles.id, imp.parserProfileId),
          or(eq(bankStatementProfiles.tenantId, tenantId), isNull(bankStatementProfiles.tenantId)),
        ),
      );
    return;
  }

  const columnMap = meta.columnMap;
  if (!columnMap || Object.keys(columnMap).length === 0) return;

  const bankName = meta.bankName ?? 'Bank';
  const name = `${bankName} layout`.slice(0, 120);

  const [existing] = await db()
    .select({ id: bankStatementProfiles.id, successCount: bankStatementProfiles.successCount })
    .from(bankStatementProfiles)
    .where(
      and(
        eq(bankStatementProfiles.tenantId, tenantId),
        eq(bankStatementProfiles.name, name),
        isNull(bankStatementProfiles.voidedAt),
      ),
    )
    .limit(1);

  if (existing) {
    await db()
      .update(bankStatementProfiles)
      .set({
        columnMap,
        signConvention: meta.signConvention ?? 'debit_credit',
        skipRows: meta.skipRows ?? 0,
        sheetName: meta.sheetName ?? null,
        bankHint: bankName.slice(0, 120),
        successCount: (existing.successCount ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(bankStatementProfiles.id, existing.id));
    await db()
      .update(bankStatementImports)
      .set({ parserProfileId: existing.id, updatedAt: new Date() })
      .where(eq(bankStatementImports.id, importId));
    return;
  }

  const [created] = await db()
    .insert(bankStatementProfiles)
    .values({
      tenantId,
      name,
      bankHint: bankName.slice(0, 120),
      columnMap,
      signConvention: meta.signConvention ?? 'debit_credit',
      skipRows: meta.skipRows ?? 0,
      sheetName: meta.sheetName ?? null,
      successCount: 1,
    })
    .returning({ id: bankStatementProfiles.id });

  if (created) {
    await db()
      .update(bankStatementImports)
      .set({ parserProfileId: created.id, updatedAt: new Date() })
      .where(eq(bankStatementImports.id, importId));
  }
}

async function loadImportView(
  tenantId: string,
  importId: string,
): Promise<StatementImportView | null> {
  const [imp] = await db()
    .select({
      id: bankStatementImports.id,
      period: bankStatementImports.period,
      periodFrom: bankStatementImports.periodFrom,
      periodTo: bankStatementImports.periodTo,
      fileName: bankStatementImports.fileName,
      status: bankStatementImports.status,
      bankAccountId: bankStatementImports.bankAccountId,
      bookDomain: bankStatementImports.bookDomain,
      source: bankStatementImports.source,
      fileSha256: bankStatementImports.fileSha256,
      rowCount: bankStatementImports.rowCount,
      matchedCount: bankStatementImports.matchedCount,
      unmatchedCount: bankStatementImports.unmatchedCount,
      metadata: bankStatementImports.metadata,
      parserProfileId: bankStatementImports.parserProfileId,
    })
    .from(bankStatementImports)
    .where(
      and(
        eq(bankStatementImports.tenantId, tenantId),
        eq(bankStatementImports.id, importId),
        isNull(bankStatementImports.voidedAt),
      ),
    )
    .limit(1);
  if (!imp) return null;

  let bankAccountCode: string | null = null;
  let bankAccountName: string | null = null;
  if (imp.bankAccountId) {
    const [acc] = await db()
      .select({ code: accounts.code, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.id, imp.bankAccountId), eq(accounts.tenantId, tenantId)))
      .limit(1);
    bankAccountCode = acc?.code ?? null;
    bankAccountName = acc?.name ?? null;
  }

  const lineRows = await db()
    .select({
      id: bankStatementLines.id,
      rowNumber: bankStatementLines.rowNumber,
      transactionDate: bankStatementLines.transactionDate,
      description: bankStatementLines.description,
      amount: bankStatementLines.amount,
      direction: bankStatementLines.direction,
      status: bankStatementLines.status,
      proposedAction: bankStatementLines.proposedAction,
      matchScore: bankStatementLines.matchScore,
      matchMethod: bankStatementLines.matchMethod,
      matchedTransactionId: bankStatementLines.matchedTransactionId,
      createdTransactionId: bankStatementLines.createdTransactionId,
      confidence: bankStatementLines.confidence,
      fingerprint: bankStatementLines.fingerprint,
      externalRef: bankStatementLines.externalRef,
      matchCandidates: bankStatementLines.matchCandidates,
      raw: bankStatementLines.raw,
      notes: bankStatementLines.notes,
    })
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.tenantId, tenantId),
        eq(bankStatementLines.importId, importId),
        isNull(bankStatementLines.voidedAt),
      ),
    )
    .orderBy(bankStatementLines.rowNumber);

  // Hydrate match candidates with book entry details for match UI
  const candidateIds = new Set<string>();
  for (const row of lineRows) {
    if (row.matchedTransactionId) candidateIds.add(row.matchedTransactionId);
    if (Array.isArray(row.matchCandidates)) {
      for (const c of row.matchCandidates as { id?: string }[]) {
        if (c?.id) candidateIds.add(c.id);
      }
    }
  }
  const bookById = new Map<string, { date: string; description: string; amountSigned: number }>();
  if (candidateIds.size > 0 && imp.bankAccountId) {
    const ids = [...candidateIds];
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const txs = await db()
        .select({
          id: transactions.id,
          date: transactions.date,
          description: transactions.description,
          amount: transactions.amount,
          direction: transactions.direction,
          paymentAccountId: transactions.paymentAccountId,
          transferSourceAccountId: transactions.transferSourceAccountId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.tenantId, tenantId),
            isNull(transactions.voidedAt),
            inArray(transactions.id, chunk),
          ),
        );
      for (const t of txs) {
        const signed =
          bookSignedAmount(
            t.direction,
            Number(t.amount),
            t.paymentAccountId,
            t.transferSourceAccountId,
            imp.bankAccountId,
          ) ?? (t.direction === 'money_out' ? -Number(t.amount) : Number(t.amount));
        bookById.set(t.id, {
          date: t.date,
          description: t.description,
          amountSigned: signed,
        });
      }
    }
  }

  const lines = lineRows.map((row) => toLineView(row, bookById));
  const meta = (imp.metadata ?? {}) as {
    warnings?: string[];
    multiMonth?: boolean;
    batchId?: string;
    profileName?: string;
    profileLearned?: boolean;
  };
  const periodFrom = imp.periodFrom;
  const periodTo = imp.periodTo;
  const multiMonth =
    meta.multiMonth ??
    Boolean(periodFrom && periodTo && periodFrom.slice(0, 7) !== periodTo.slice(0, 7));
  const months = [...new Set(lines.map((l) => l.month))].sort();

  return {
    id: imp.id,
    period: imp.period,
    periodFrom,
    periodTo,
    fileName: imp.fileName,
    status: imp.status,
    bankAccountId: imp.bankAccountId,
    bankAccountCode,
    bankAccountName,
    bookDomain: imp.bookDomain,
    source: imp.source,
    fileSha256: imp.fileSha256,
    rowCount: Number(imp.rowCount),
    matchedCount: Number(imp.matchedCount),
    unmatchedCount: Number(imp.unmatchedCount),
    warnings: meta.warnings ?? [],
    multiMonth,
    batchId: meta.batchId ?? null,
    profileName: meta.profileName ?? null,
    profileLearned: Boolean(meta.profileLearned || imp.parserProfileId),
    months,
    lines,
    counts: countBy(
      lines.map((l) => ({
        proposedAction: l.proposedAction,
        status: l.status,
        flags: l.flags,
      })),
    ),
  };
}

async function refreshImportCounts(importId: string, tenantId: string) {
  const rows = await db()
    .select({
      status: bankStatementLines.status,
      proposedAction: bankStatementLines.proposedAction,
    })
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.tenantId, tenantId),
        eq(bankStatementLines.importId, importId),
        isNull(bankStatementLines.voidedAt),
      ),
    );
  const matchedCount = rows.filter(
    (r) =>
      r.status === 'matched' ||
      r.status === 'reconciled' ||
      r.status === 'created' ||
      r.status === 'duplicate' ||
      r.status === 'skipped',
  ).length;
  const allDone = rows.length > 0 && matchedCount === rows.length;
  const anyDone = matchedCount > 0;
  await db()
    .update(bankStatementImports)
    .set({
      rowCount: rows.length.toString(),
      matchedCount: matchedCount.toString(),
      unmatchedCount: (rows.length - matchedCount).toString(),
      status: allDone ? 'completed' : anyDone ? 'partial' : 'ready',
      updatedAt: new Date(),
    })
    .where(and(eq(bankStatementImports.id, importId), eq(bankStatementImports.tenantId, tenantId)));
}

type CommitOneResult =
  | { ok: true; importId: string; reused: boolean; fileName: string; rowCount: number; periodFrom: string | null; periodTo: string | null }
  | { ok: false; error: string; fileName: string };

function parseProfileFromForm(raw: FormDataEntryValue | null): ParseProfile | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const p = JSON.parse(raw) as ParseProfile;
    if (!p || typeof p !== 'object') return null;
    if (!p.columnMap || typeof p.columnMap !== 'object') return null;
    const sign = p.signConvention as SignConvention;
    if (
      sign !== 'signed_amount' &&
      sign !== 'debit_credit' &&
      sign !== 'credit_debit' &&
      sign !== 'amount_with_type'
    ) {
      return null;
    }
    return {
      name: String(p.name || 'Custom map').slice(0, 120),
      bankHint: p.bankHint ? String(p.bankHint).slice(0, 120) : undefined,
      columnMap: p.columnMap,
      signConvention: sign,
      dateFormatHint: p.dateFormatHint,
      skipRows: typeof p.skipRows === 'number' ? p.skipRows : Number(p.skipRows) || 0,
      sheetName: p.sheetName,
    };
  } catch {
    return null;
  }
}

/**
 * SI-4.1: Preview raw sheet + suggested mapping without writing to DB.
 * Supports: auto-detect, SL bank preset, or fully user-forced profileJson.
 */
export async function previewStatementMapping(formData: FormData): Promise<
  | {
      ok: true;
      preview: SheetPreview;
      sampleLines: {
        date: string;
        description: string;
        amountSigned: number;
        direction: string;
      }[];
      warnings: string[];
      lineCount: number;
      periodFrom: string | null;
      periodTo: string | null;
      suggestedPresetId: SlBankPresetId;
      presets: ReturnType<typeof listPresetsForUi>;
    }
  | { ok: false; error: string }
> {
  try {
    await requireTenantContext();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'Choose an Excel or CSV file.' };
    }
    if (!ALLOWED_EXT.test(file.name)) {
      return { ok: false, error: 'Use .xlsx, .xls, or .csv.' };
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return { ok: false, error: 'File empty or too large (max 12 MB).' };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sheetName = String(formData.get('sheetName') || '') || undefined;
    const bankName = String(formData.get('bankName') || '');
    const presetIdRaw = String(formData.get('presetId') || 'auto') as SlBankPresetId;
    const forced = parseProfileFromForm(formData.get('profileJson'));
    const preview = previewStatementSheet(bytes, file.name, { sheetName, maxRows: 40 });
    const suggestedPresetId = suggestPresetFromBankName(bankName || file.name);

    let profile: ParseProfile = preview.suggested;

    if (forced) {
      profile = forced;
    } else if (presetIdRaw && presetIdRaw !== 'auto') {
      const preset = getPreset(presetIdRaw);
      if (preset && presetIdRaw !== 'manual') {
        const headerRow = preview.headerRowIndex;
        const headerCells = preview.rows[headerRow] ?? [];
        const applied = applyPresetToHeaders(preset, headerCells);
        profile = {
          ...applied,
          skipRows: headerRow,
          sheetName: preview.sheetName,
          name: applied.name || preset.label,
        };
        // Fall back field-by-field to auto if preset miss
        const auto = preview.suggested.columnMap;
        profile.columnMap = {
          date: profile.columnMap.date ?? auto.date,
          description: profile.columnMap.description ?? auto.description,
          amount: profile.columnMap.amount ?? auto.amount,
          type: profile.columnMap.type ?? auto.type,
          debit: profile.columnMap.debit ?? auto.debit,
          credit: profile.columnMap.credit ?? auto.credit,
          balance: profile.columnMap.balance ?? auto.balance,
          ref: profile.columnMap.ref ?? auto.ref,
        };
      } else if (presetIdRaw === 'manual') {
        // Keep auto suggestion as starting point; UI labels as manual
        profile = {
          ...preview.suggested,
          name: 'Manual map',
        };
      }
    }

    if (sheetName) profile.sheetName = sheetName;
    if (formData.get('headerRow') != null && formData.get('headerRow') !== '') {
      const hr = Number(formData.get('headerRow'));
      if (Number.isFinite(hr) && hr >= 0) profile.skipRows = hr;
    }

    const parsed = parseStatementFile(Buffer.from(bytes), file.name, {
      tenantId: 'preview',
      bankAccountId: 'preview',
      profile,
      sheetName: profile.sheetName ?? sheetName,
    });

    const warnings = parsed.warnings.filter((w) => !w.startsWith('Sample:'));
    if (parsed.lines.length === 0) {
      warnings.unshift(
        'No lines yet — try another bank style (preset), change header row, or map columns manually.',
      );
    }

    return {
      ok: true,
      preview: {
        ...preview,
        suggested: profile,
        headerRowIndex: profile.skipRows ?? preview.headerRowIndex,
      },
      sampleLines: parsed.lines.slice(0, 12).map((l) => ({
        date: l.date,
        description: l.description,
        amountSigned: l.amountSigned,
        direction: l.direction,
      })),
      warnings,
      lineCount: parsed.lines.length,
      periodFrom: parsed.periodFrom,
      periodTo: parsed.periodTo,
      suggestedPresetId,
      presets: listPresetsForUi(),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not preview file.',
    };
  }
}

async function commitOneFileBuffer(opts: {
  tenantId: string;
  userId: string;
  bankAccountId: string;
  bookDomain: string | null;
  source: 'cashbook' | 'erp_recon';
  fileName: string;
  bytes: Uint8Array;
  batchId?: string | null;
  batchIndex?: number;
  batchSize?: number;
  /** User-confirmed profile — required for accurate bank layouts */
  profile?: ParseProfile | null;
  /** When true, do not auto-pick learned profile over user map */
  forceProfile?: boolean;
}): Promise<CommitOneResult> {
  const { tenantId, userId, bankAccountId, bookDomain, source, fileName, bytes } = opts;
  if (!ALLOWED_EXT.test(fileName)) {
    return { ok: false, error: 'Use .xlsx, .xls, or .csv from your bank download.', fileName };
  }
  if (bytes.byteLength <= 0) return { ok: false, error: 'File is empty.', fileName };
  if (bytes.byteLength > MAX_BYTES) {
    return { ok: false, error: 'File is too large (max 12 MB). Prefer monthly exports.', fileName };
  }

  const sha = fileSha256(Buffer.from(bytes));

  return withTenantContext(tenantId, async () => {
    const [bank] = await db()
      .select({ id: accounts.id, code: accounts.code, name: accounts.name })
      .from(accounts)
      .where(
        and(
          eq(accounts.tenantId, tenantId),
          eq(accounts.id, bankAccountId),
          isNull(accounts.voidedAt),
        ),
      )
      .limit(1);
    if (!bank) return { ok: false as const, error: 'Bank account not found.', fileName };

    const [existing] = await db()
      .select({ id: bankStatementImports.id, rowCount: bankStatementImports.rowCount, periodFrom: bankStatementImports.periodFrom, periodTo: bankStatementImports.periodTo })
      .from(bankStatementImports)
      .where(
        and(
          eq(bankStatementImports.tenantId, tenantId),
          eq(bankStatementImports.bankAccountId, bankAccountId),
          eq(bankStatementImports.fileSha256, sha),
          isNull(bankStatementImports.voidedAt),
        ),
      )
      .orderBy(desc(bankStatementImports.createdAt))
      .limit(1);
    if (existing) {
      return {
        ok: true as const,
        importId: existing.id,
        reused: true,
        fileName,
        rowCount: Number(existing.rowCount),
        periodFrom: existing.periodFrom,
        periodTo: existing.periodTo,
      };
    }

    const learned =
      opts.forceProfile || opts.profile ? null : await loadBestProfile(tenantId, bank.name);
    const profileToUse = opts.profile ?? learned?.profile ?? null;
    const parsed = parseStatementFile(Buffer.from(bytes), fileName, {
      tenantId,
      bankAccountId,
      profile: profileToUse,
      sheetName: profileToUse?.sheetName,
    });

    if (parsed.lines.length === 0) {
      return {
        ok: false as const,
        error:
          parsed.warnings[0] ??
          'No transaction rows found. Check the file has date, description, and amount columns.',
        fileName,
      };
    }
    if (parsed.lines.length > MAX_ROWS) {
      return {
        ok: false as const,
        error: `Too many rows (${parsed.lines.length}). Split into monthly files (max ${MAX_ROWS}).`,
        fileName,
      };
    }

    const balanceFlags = annotateBalanceContinuity(parsed.lines);
    const fps = parsed.lines.map((l) => l.fingerprint);
    const knownFp = await existingFingerprints(tenantId, fps);
    const books = await loadBookCandidates(
      tenantId,
      bankAccountId,
      parsed.periodFrom,
      parsed.periodTo,
      bookDomain,
    );
    const matches = matchAll(parsed.lines, books);

    const periodFrom = parsed.periodFrom;
    const periodTo = parsed.periodTo;
    const multiMonth = Boolean(
      periodFrom && periodTo && periodFrom.slice(0, 7) !== periodTo.slice(0, 7),
    );
    const period = (periodTo ?? periodFrom ?? new Date().toISOString().slice(0, 10)).slice(0, 7);

    const warnings = [...parsed.warnings];
    if (opts.profile) {
      warnings.unshift(`Using your confirmed mapping “${opts.profile.name}”.`);
    } else if (learned) {
      warnings.unshift(`Using saved layout “${learned.profile.name}” for ${bank.name}.`);
    }
    if (multiMonth) {
      warnings.push(
        'This file spans more than one month. Prefer monthly exports when possible. Review carefully.',
      );
    }

    const breakCount = [...balanceFlags.values()].filter((f) => f === 'BALANCE_BREAK').length;
    if (breakCount > 0) {
      warnings.push(
        `${breakCount} line(s) have a running-balance mismatch — check those rows (amber flag).`,
      );
    }

    const fresh = matches.filter((m) => !knownFp.has(m.line.fingerprint));
    const skippedDup = matches.length - fresh.length;
    if (skippedDup > 0) {
      warnings.push(
        `${skippedDup} line(s) already imported before for this bank — skipped to avoid duplicates.`,
      );
    }

    const enriched: Array<MatchResult & { finalAction: ProposedAction }> = fresh.map((m) => {
      let action = m.proposedAction;
      const bal = balanceFlags.get(m.line.rowNumber);
      // Balance break forces human review even if score was high
      if (bal === 'BALANCE_BREAK' && action === 'link') {
        action = 'review';
      }
      return { ...m, proposedAction: action, finalAction: action };
    });

    if (enriched.length === 0) {
      return {
        ok: false as const,
        error:
          skippedDup > 0
            ? 'All rows in this file were already imported. Nothing new to review.'
            : 'No new rows to import.',
        fileName,
      };
    }

    const matchedCount = enriched.filter((m) => m.finalAction === 'link').length;

    const importId = await db().transaction(async (tx) => {
      const [created] = await tx
        .insert(bankStatementImports)
        .values({
          tenantId,
          userId,
          period,
          fileName: fileName.slice(0, 255),
          status: 'ready',
          rowCount: enriched.length.toString(),
          matchedCount: matchedCount.toString(),
          unmatchedCount: (enriched.length - matchedCount).toString(),
          bankAccountId,
          bookDomain,
          fileSha256: sha,
          periodFrom,
          periodTo,
          source,
          parserProfileId: learned?.id ?? null,
          metadata: {
            warnings: warnings.filter((w) => !w.startsWith('Sample:')),
            multiMonth,
            profileName: parsed.profile.name,
            profileAuto: parsed.profileAuto && !opts.profile,
            profileLearned: Boolean(learned) || Boolean(opts.profile),
            columnMap: parsed.profile.columnMap,
            signConvention: parsed.profile.signConvention,
            skipRows: parsed.profile.skipRows ?? parsed.headerRowIndex,
            sheetName: parsed.profile.sheetName,
            bankCode: bank.code,
            bankName: bank.name,
            batchId: opts.batchId ?? null,
            batchIndex: opts.batchIndex ?? 0,
            batchSize: opts.batchSize ?? 1,
            balanceBreaks: breakCount,
            userConfirmedMap: Boolean(opts.profile),
          },
        })
        .returning({ id: bankStatementImports.id });

      for (const m of enriched) {
        const action = m.finalAction;
        let status = mapActionToStatus(action, Boolean(m.matchedTransactionId));
        const bal = balanceFlags.get(m.line.rowNumber);
        const flags: string[] = [];
        if (bal === 'BALANCE_BREAK') {
          flags.push('BALANCE_BREAK');
          if (status === 'matched') status = 'review';
        }
        const raw = { ...m.line.raw, _flags: flags };
        await tx.insert(bankStatementLines).values({
          tenantId,
          importId: created.id,
          matchedTransactionId: action === 'link' ? m.matchedTransactionId : null,
          rowNumber: m.line.rowNumber.toString(),
          transactionDate: m.line.date,
          description: m.line.description.slice(0, 1000),
          amount: m.line.amountSigned.toFixed(2),
          status,
          raw,
          notes: flags.includes('BALANCE_BREAK') ? 'BALANCE_BREAK' : null,
          fingerprint: m.line.fingerprint,
          direction: m.line.direction,
          balanceAfter:
            m.line.balanceAfter != null ? m.line.balanceAfter.toFixed(2) : null,
          externalRef: m.line.externalRef?.slice(0, 100) ?? null,
          matchScore: m.matchScore.toFixed(4),
          matchMethod: m.matchMethod,
          matchCandidates: m.candidates,
          proposedAction: action,
          confidence: m.confidence.toFixed(4),
        });
      }

      await tx.insert(bankStatementImportEvents).values({
        tenantId,
        importId: created.id,
        userId,
        action: 'import_committed',
        detail: {
          fileName,
          rowCount: enriched.length,
          profile: parsed.profile.name,
          multiMonth,
          batchId: opts.batchId ?? null,
          balanceBreaks: breakCount,
        },
      });

      await tx.insert(auditLog).values({
        tenantId,
        userId,
        action: 'IMPORT',
        tableName: 'bank_statement_imports',
        recordId: created.id,
        newValues: {
          fileName,
          bankAccountId,
          rowCount: enriched.length,
          period,
          source,
          batchId: opts.batchId ?? null,
        },
        notes: 'Statement import staged (no GL writes).',
      });

      return created.id;
    });

    return {
      ok: true as const,
      importId,
      reused: false,
      fileName,
      rowCount: enriched.length,
      periodFrom,
      periodTo,
    };
  });
}

/**
 * Upload Excel/CSV, parse, match, persist staging lines. No GL writes.
 */
export async function commitStatementImport(formData: FormData): Promise<
  { ok: true; importId: string; reused?: boolean } | { ok: false; error: string }
> {
  try {
    const user = await requireTenantContext();
    const bankAccountId = String(formData.get('bankAccountId') ?? '');
    const bookDomainRaw = formData.get('bookDomain');
    const bookDomain =
      bookDomainRaw === 'personal' || bookDomainRaw === 'business' ? bookDomainRaw : null;
    const source = sourceSchema.parse(String(formData.get('source') ?? 'cashbook'));
    const file = formData.get('file');

    if (!z.string().uuid().safeParse(bankAccountId).success) {
      return { ok: false, error: 'Select a bank account first.' };
    }
    if (!(file instanceof File)) {
      return { ok: false, error: 'Choose an Excel or CSV file from your bank.' };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const profile = parseProfileFromForm(formData.get('profileJson'));
    const forceProfile = formData.get('forceProfile') === '1' || Boolean(profile);
    const result = await commitOneFileBuffer({
      tenantId: user.tenantId,
      userId: user.id,
      bankAccountId,
      bookDomain,
      source,
      fileName: file.name,
      bytes,
      profile,
      forceProfile,
    });

    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath('/cashbook');
    revalidatePath('/cashbook/import');
    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    return { ok: true, importId: result.importId, reused: result.reused };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not import statement.',
    };
  }
}

/**
 * SI-4: Upload multiple Excel/CSV files for the same bank in one batch.
 */
export async function commitStatementBatch(formData: FormData): Promise<
  | { ok: true; batchId: string; items: StatementBatchItem[]; firstImportId: string | null }
  | { ok: false; error: string }
> {
  try {
    const user = await requireTenantContext();
    const bankAccountId = String(formData.get('bankAccountId') ?? '');
    const bookDomainRaw = formData.get('bookDomain');
    const bookDomain =
      bookDomainRaw === 'personal' || bookDomainRaw === 'business' ? bookDomainRaw : null;
    const source = sourceSchema.parse(String(formData.get('source') ?? 'cashbook'));

    if (!z.string().uuid().safeParse(bankAccountId).success) {
      return { ok: false, error: 'Select a bank account first.' };
    }

    const collected: File[] = [];
    const multi = formData.getAll('files');
    for (const f of multi) {
      if (f instanceof File && f.size > 0) collected.push(f);
    }
    const single = formData.get('file');
    if (single instanceof File && single.size > 0) collected.push(single);

    if (collected.length === 0) {
      return { ok: false, error: 'Choose one or more Excel/CSV files from your bank.' };
    }
    if (collected.length > MAX_BATCH_FILES) {
      return {
        ok: false,
        error: `Too many files (max ${MAX_BATCH_FILES}). Upload in smaller batches.`,
      };
    }

    const batchId = randomUUID();
    const items: StatementBatchItem[] = [];
    const profile = parseProfileFromForm(formData.get('profileJson'));
    const forceProfile = formData.get('forceProfile') === '1' || Boolean(profile);

    for (let i = 0; i < collected.length; i++) {
      const file = collected[i]!;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await commitOneFileBuffer({
        tenantId: user.tenantId,
        userId: user.id,
        bankAccountId,
        bookDomain,
        source,
        fileName: file.name,
        bytes,
        batchId,
        batchIndex: i,
        batchSize: collected.length,
        profile,
        forceProfile,
      });
      if (result.ok) {
        items.push({
          importId: result.importId,
          fileName: result.fileName,
          reused: result.reused,
          rowCount: result.rowCount,
          periodFrom: result.periodFrom,
          periodTo: result.periodTo,
        });
      } else {
        items.push({
          importId: '',
          fileName: result.fileName,
          reused: false,
          error: result.error,
        });
      }
    }

    const okItems = items.filter((i) => i.importId);
    if (okItems.length === 0) {
      return {
        ok: false,
        error: items.map((i) => `${i.fileName}: ${i.error}`).join(' · ') || 'No files imported.',
      };
    }

    revalidatePath('/cashbook');
    revalidatePath('/cashbook/import');
    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    return {
      ok: true,
      batchId,
      items,
      firstImportId: okItems[0]?.importId ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not import batch.',
    };
  }
}

export async function getStatementBatch(importIds: string[]): Promise<StatementImportView[]> {
  const user = await requireTenantContext();
  const ids = importIds.filter((id) => z.string().uuid().safeParse(id).success);
  if (ids.length === 0) return [];
  return withTenantContext(user.tenantId, async () => {
    const views: StatementImportView[] = [];
    for (const id of ids) {
      const v = await loadImportView(user.tenantId, id);
      if (v) views.push(v);
    }
    return views;
  });
}

export async function getStatementImport(
  importId: string,
): Promise<StatementImportView | null> {
  const user = await requireTenantContext();
  if (!z.string().uuid().safeParse(importId).success) return null;
  return withTenantContext(user.tenantId, () => loadImportView(user.tenantId, importId));
}

export async function listRecentStatementImports(limit = 10): Promise<
  {
    id: string;
    fileName: string;
    period: string;
    status: string;
    bankName: string | null;
    rowCount: number;
    createdAt: string;
  }[]
> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: bankStatementImports.id,
        fileName: bankStatementImports.fileName,
        period: bankStatementImports.period,
        status: bankStatementImports.status,
        bankAccountId: bankStatementImports.bankAccountId,
        rowCount: bankStatementImports.rowCount,
        createdAt: bankStatementImports.createdAt,
        metadata: bankStatementImports.metadata,
      })
      .from(bankStatementImports)
      .where(
        and(
          eq(bankStatementImports.tenantId, user.tenantId),
          isNull(bankStatementImports.voidedAt),
        ),
      )
      .orderBy(desc(bankStatementImports.createdAt))
      .limit(limit);

    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as { bankName?: string };
      return {
        id: r.id,
        fileName: r.fileName,
        period: r.period,
        status: r.status,
        bankName: meta.bankName ?? null,
        rowCount: Number(r.rowCount),
        createdAt: r.createdAt.toISOString(),
      };
    });
  });
}

/**
 * Confirm proposed (or selected) link matches — no journal edits.
 */
export async function confirmStatementLinks(input: {
  importId: string;
  lineIds?: string[];
}): Promise<{ ok: true; linked: number } | { ok: false; error: string }> {
  try {
    const importId = z.string().uuid().parse(input.importId);
    const user = await requireTenantContext();

    const linked = await withTenantContext(user.tenantId, async () => {
      const conditions = [
        eq(bankStatementLines.tenantId, user.tenantId),
        eq(bankStatementLines.importId, importId),
        isNull(bankStatementLines.voidedAt),
        eq(bankStatementLines.proposedAction, 'link'),
        inArray(bankStatementLines.status, ['matched', 'review']),
      ];
      if (input.lineIds?.length) {
        conditions.push(inArray(bankStatementLines.id, input.lineIds));
      }

      const lines = await db()
        .select({
          id: bankStatementLines.id,
          matchedTransactionId: bankStatementLines.matchedTransactionId,
          status: bankStatementLines.status,
        })
        .from(bankStatementLines)
        .where(and(...conditions));

      let n = 0;
      for (const line of lines) {
        if (!line.matchedTransactionId) continue;
        if (line.status === 'reconciled') continue;

        // Verify tx belongs to tenant
        const [tx] = await db()
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.id, line.matchedTransactionId),
              eq(transactions.tenantId, user.tenantId),
              isNull(transactions.voidedAt),
            ),
          )
          .limit(1);
        if (!tx) continue;

        await db()
          .update(bankStatementLines)
          .set({
            status: 'reconciled',
            reviewedByUserId: user.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bankStatementLines.id, line.id),
              eq(bankStatementLines.tenantId, user.tenantId),
            ),
          );

        await db().insert(bankStatementImportEvents).values({
          tenantId: user.tenantId,
          importId,
          userId: user.id,
          lineId: line.id,
          action: 'link_confirmed',
          detail: { transactionId: line.matchedTransactionId },
        });
        n += 1;
      }

      await refreshImportCounts(importId, user.tenantId);
      await learnProfileFromImport(user.tenantId, importId);
      return n;
    });

    revalidatePath('/cashbook');
    revalidatePath('/cashbook/import');
    revalidatePath('/cashbook/match');
    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    return { ok: true, linked };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not confirm matches.' };
  }
}

/**
 * Manually link a review line to a book transaction.
 */
export async function manualLinkStatementLine(input: {
  lineId: string;
  transactionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const lineId = z.string().uuid().parse(input.lineId);
    const transactionId = z.string().uuid().parse(input.transactionId);
    const user = await requireTenantContext();

    await withTenantContext(user.tenantId, async () => {
      const [line] = await db()
        .select({
          id: bankStatementLines.id,
          importId: bankStatementLines.importId,
          status: bankStatementLines.status,
        })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.id, lineId),
            eq(bankStatementLines.tenantId, user.tenantId),
            isNull(bankStatementLines.voidedAt),
          ),
        )
        .limit(1);
      if (!line) throw new Error('Line not found.');
      if (line.status === 'created' || line.status === 'reconciled') {
        throw new Error('This line is already finalized.');
      }

      const [tx] = await db()
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.id, transactionId),
            eq(transactions.tenantId, user.tenantId),
            isNull(transactions.voidedAt),
          ),
        )
        .limit(1);
      if (!tx) throw new Error('Transaction not found.');

      await db()
        .update(bankStatementLines)
        .set({
          matchedTransactionId: transactionId,
          proposedAction: 'link',
          matchMethod: 'manual',
          matchScore: '1.0000',
          status: 'reconciled',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(eq(bankStatementLines.id, lineId), eq(bankStatementLines.tenantId, user.tenantId)),
        );

      await db().insert(bankStatementImportEvents).values({
        tenantId: user.tenantId,
        importId: line.importId,
        userId: user.id,
        lineId,
        action: 'manual_link',
        detail: { transactionId },
      });

      await refreshImportCounts(line.importId, user.tenantId);
    });

    revalidatePath('/cashbook/import');
    revalidatePath('/cashbook/match');
    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not link line.' };
  }
}

/**
 * Create cashbook/GL entries for proposed create lines via recordEntry.
 */
export async function confirmStatementCreates(input: {
  importId: string;
  lineIds?: string[];
  /** Default expense category for money out (cashbook) */
  defaultExpenseCode?: string;
  /** Default income category for money in */
  defaultIncomeCode?: string;
  /**
   * Optional per-line category overrides (code).
   * Keyed by line id; direction still comes from amount sign.
   */
  categoryByLineId?: Record<string, string>;
}): Promise<{ ok: true; created: number; errors: string[] } | { ok: false; error: string }> {
  try {
    const importId = z.string().uuid().parse(input.importId);
    const user = await requireTenantContext();
    const expenseCode = (input.defaultExpenseCode ?? '6800').slice(0, 20);
    const incomeCode = (input.defaultIncomeCode ?? '4300').slice(0, 20);
    const categoryByLineId = input.categoryByLineId ?? {};

    // Load staging data first (own tenant context — do not nest recordEntry inside)
    const prepared = await withTenantContext(user.tenantId, async () => {
      const [imp] = await db()
        .select({
          id: bankStatementImports.id,
          bankAccountId: bankStatementImports.bankAccountId,
          bookDomain: bankStatementImports.bookDomain,
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
      if (!imp?.bankAccountId) throw new Error('Import or bank account missing.');

      const [bank] = await db()
        .select({ id: accounts.id, code: accounts.code })
        .from(accounts)
        .where(
          and(
            eq(accounts.id, imp.bankAccountId),
            eq(accounts.tenantId, user.tenantId),
            isNull(accounts.voidedAt),
          ),
        )
        .limit(1);
      if (!bank) throw new Error('Bank account not found.');

      // Open unmatched lines — explicit lineIds from create rail preferred
      const base = [
        eq(bankStatementLines.tenantId, user.tenantId),
        eq(bankStatementLines.importId, importId),
        isNull(bankStatementLines.voidedAt),
        isNull(bankStatementLines.createdTransactionId),
      ];
      const lines = await db()
        .select({
          id: bankStatementLines.id,
          date: bankStatementLines.transactionDate,
          description: bankStatementLines.description,
          amount: bankStatementLines.amount,
          fingerprint: bankStatementLines.fingerprint,
          status: bankStatementLines.status,
          proposedAction: bankStatementLines.proposedAction,
        })
        .from(bankStatementLines)
        .where(
          and(
            ...base,
            input.lineIds?.length
              ? inArray(bankStatementLines.id, input.lineIds)
              : and(
                  inArray(bankStatementLines.status, ['unmatched', 'review', 'imported']),
                  or(
                    eq(bankStatementLines.proposedAction, 'create'),
                    eq(bankStatementLines.status, 'unmatched'),
                    eq(bankStatementLines.proposedAction, 'review'),
                  ),
                ),
          ),
        );

      // Never create for already-linked/finalized rows
      const allowed = lines.filter(
        (l) => !['reconciled', 'created', 'skipped', 'duplicate'].includes(l.status),
      );

      const periods = [...new Set(allowed.map((l) => l.date.slice(0, 7)))];
      for (const period of periods) {
        const [lock] = await db()
          .select({ id: periodLocks.id })
          .from(periodLocks)
          .where(
            and(
              eq(periodLocks.tenantId, user.tenantId),
              eq(periodLocks.period, period),
              eq(periodLocks.status, 'locked'),
              isNull(periodLocks.voidedAt),
            ),
          )
          .limit(1);
        if (lock) {
          throw new Error(
            `Period ${period} is locked. Unlock it before adding new bank entries for that month.`,
          );
        }
      }

      return {
        bankCode: bank.code,
        bookDomain: imp.bookDomain,
        lines: allowed,
      };
    });

    const payMethod =
      prepared.bankCode === '1000'
        ? 'Cash'
        : prepared.bankCode.startsWith('12')
          ? 'Card'
          : 'Bank';
    const bookDomain =
      prepared.bookDomain === 'personal' || prepared.bookDomain === 'business'
        ? prepared.bookDomain
        : undefined;

    let created = 0;
    const errors: string[] = [];

    for (const line of prepared.lines) {
      const signed = Number(line.amount);
      const abs = Math.abs(signed);
      if (abs < 0.005) {
        errors.push(`Row skipped (zero amount): ${line.description.slice(0, 40)}`);
        continue;
      }
      const isIn = signed > 0;
      const desc = line.description.slice(0, 1000) || 'Bank statement';
      const party = isIn ? 'Bank deposit' : 'Bank payment';
      const lineCat = categoryByLineId[line.id]?.slice(0, 20);
      const catCode = lineCat || (isIn ? incomeCode : expenseCode);

      const entryResult = isIn
        ? await recordEntry({
            direction: 'money_in',
            moneyInType: 'new_sale',
            party,
            description: desc,
            amount: abs,
            currency: 'LKR',
            paymentMethod: payMethod as 'Cash' | 'Bank' | 'Card',
            paymentAccount: { kind: 'code', value: prepared.bankCode },
            date: line.date,
            bookDomain,
            categoryOverride: catCode,
            forceDuplicate: true,
            receiptRef: `stmt:${line.fingerprint?.slice(0, 16) ?? line.id.slice(0, 8)}`,
          })
        : await recordEntry({
            direction: 'money_out',
            party,
            description: desc,
            amount: abs,
            currency: 'LKR',
            paymentMethod: payMethod as 'Cash' | 'Bank' | 'Card',
            paymentAccount: { kind: 'code', value: prepared.bankCode },
            date: line.date,
            bookDomain,
            categoryOverride: catCode,
            forceDuplicate: true,
            receiptRef: `stmt:${line.fingerprint?.slice(0, 16) ?? line.id.slice(0, 8)}`,
          });

      if (!entryResult.success || !entryResult.transactionId) {
        errors.push(`${line.date} ${desc.slice(0, 30)}: ${entryResult.error ?? 'create failed'}`);
        continue;
      }

      await withTenantContext(user.tenantId, async () => {
        await db()
          .update(bankStatementLines)
          .set({
            status: 'created',
            proposedAction: 'create',
            createdTransactionId: entryResult.transactionId,
            matchedTransactionId: entryResult.transactionId,
            reconciliationStatus: 'created',
            reviewedByUserId: user.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bankStatementLines.id, line.id),
              eq(bankStatementLines.tenantId, user.tenantId),
            ),
          );

        await db().insert(bankStatementImportEvents).values({
          tenantId: user.tenantId,
          importId,
          userId: user.id,
          lineId: line.id,
          action: 'create_confirmed',
          detail: {
            transactionId: entryResult.transactionId,
            category: catCode,
            direction: isIn ? 'in' : 'out',
          },
        });
      });
      created += 1;
    }

    await withTenantContext(user.tenantId, async () => {
      await refreshImportCounts(importId, user.tenantId);
      await learnProfileFromImport(user.tenantId, importId);
      await db()
        .update(bankStatementImports)
        .set({ wizardStep: 'create', updatedAt: new Date() })
        .where(
          and(
            eq(bankStatementImports.id, importId),
            eq(bankStatementImports.tenantId, user.tenantId),
          ),
        );
    });

    revalidatePath('/cashbook');
    revalidatePath('/cashbook/import');
    revalidatePath('/cashbook/match');
    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    revalidatePath('/');
    return { ok: true, created, errors };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not create entries.',
    };
  }
}

/**
 * Skip lines (mark as skipped / leave books alone).
 */
export async function skipStatementLines(input: {
  importId: string;
  lineIds: string[];
}): Promise<{ ok: true; skipped: number } | { ok: false; error: string }> {
  try {
    const importId = z.string().uuid().parse(input.importId);
    const lineIds = z.array(z.string().uuid()).min(1).parse(input.lineIds);
    const user = await requireTenantContext();

    const skipped = await withTenantContext(user.tenantId, async () => {
      const lines = await db()
        .select({ id: bankStatementLines.id, status: bankStatementLines.status })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.tenantId, user.tenantId),
            eq(bankStatementLines.importId, importId),
            inArray(bankStatementLines.id, lineIds),
            isNull(bankStatementLines.voidedAt),
          ),
        );

      let n = 0;
      for (const line of lines) {
        if (line.status === 'reconciled' || line.status === 'created') continue;
        await db()
          .update(bankStatementLines)
          .set({
            status: 'skipped',
            proposedAction: 'skip',
            reviewedByUserId: user.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bankStatementLines.id, line.id),
              eq(bankStatementLines.tenantId, user.tenantId),
            ),
          );
        await db().insert(bankStatementImportEvents).values({
          tenantId: user.tenantId,
          importId,
          userId: user.id,
          lineId: line.id,
          action: 'skip',
        });
        n += 1;
      }
      await refreshImportCounts(importId, user.tenantId);
      return n;
    });

    revalidatePath('/cashbook/import');
    revalidatePath('/reconciliation');
    return { ok: true, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not skip lines.' };
  }
}

/**
 * Undo creates from this import (reverse journals) and optionally void whole import.
 */
export async function undoStatementCreates(input: {
  importId: string;
}): Promise<{ ok: true; reversed: number; errors: string[] } | { ok: false; error: string }> {
  try {
    const importId = z.string().uuid().parse(input.importId);
    const user = await requireTenantContext();

    const lines = await withTenantContext(user.tenantId, async () =>
      db()
        .select({
          id: bankStatementLines.id,
          createdTransactionId: bankStatementLines.createdTransactionId,
        })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.tenantId, user.tenantId),
            eq(bankStatementLines.importId, importId),
            eq(bankStatementLines.status, 'created'),
            isNull(bankStatementLines.voidedAt),
          ),
        ),
    );

    let reversed = 0;
    const errors: string[] = [];
    for (const line of lines) {
      if (!line.createdTransactionId) continue;
      // reverse outside nested tenant context (it sets its own)
      const rev = await reverseTransactionById(line.createdTransactionId);
      if (!rev.success) {
        errors.push(rev.error ?? `Could not reverse ${line.createdTransactionId}`);
        continue;
      }
      await withTenantContext(user.tenantId, async () => {
        await db()
          .update(bankStatementLines)
          .set({
            status: 'unmatched',
            proposedAction: 'create',
            createdTransactionId: null,
            matchedTransactionId: null,
            reviewedByUserId: user.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bankStatementLines.id, line.id),
              eq(bankStatementLines.tenantId, user.tenantId),
            ),
          );
        await db().insert(bankStatementImportEvents).values({
          tenantId: user.tenantId,
          importId,
          userId: user.id,
          lineId: line.id,
          action: 'create_undone',
          detail: {
            originalTransactionId: line.createdTransactionId,
            reversalTransactionId: rev.reversalTransactionId,
          },
        });
      });
      reversed += 1;
    }

    await withTenantContext(user.tenantId, () => refreshImportCounts(importId, user.tenantId));

    revalidatePath('/cashbook');
    revalidatePath('/cashbook/import');
    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    return { ok: true, reversed, errors };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not undo creates.' };
  }
}

/**
 * Soft-void entire import (does not reverse created txs — use undo first).
 */
export async function voidStatementImport(importId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const id = z.string().uuid().parse(importId);
    const user = await requireTenantContext();

    await withTenantContext(user.tenantId, async () => {
      const [imp] = await db()
        .select({ id: bankStatementImports.id })
        .from(bankStatementImports)
        .where(
          and(
            eq(bankStatementImports.id, id),
            eq(bankStatementImports.tenantId, user.tenantId),
            isNull(bankStatementImports.voidedAt),
          ),
        )
        .limit(1);
      if (!imp) throw new Error('Import not found.');

      const created = await db()
        .select({ id: bankStatementLines.id })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.importId, id),
            eq(bankStatementLines.tenantId, user.tenantId),
            eq(bankStatementLines.status, 'created'),
            isNull(bankStatementLines.voidedAt),
          ),
        )
        .limit(1);
      if (created.length > 0) {
        throw new Error('Undo created entries first, then discard this import.');
      }

      const now = new Date();
      await db()
        .update(bankStatementLines)
        .set({ voidedAt: now, updatedAt: now })
        .where(
          and(
            eq(bankStatementLines.importId, id),
            eq(bankStatementLines.tenantId, user.tenantId),
            isNull(bankStatementLines.voidedAt),
          ),
        );
      await db()
        .update(bankStatementImports)
        .set({ voidedAt: now, status: 'voided', updatedAt: now })
        .where(
          and(eq(bankStatementImports.id, id), eq(bankStatementImports.tenantId, user.tenantId)),
        );

      await db().insert(bankStatementImportEvents).values({
        tenantId: user.tenantId,
        importId: id,
        userId: user.id,
        action: 'import_voided',
      });
    });

    revalidatePath('/cashbook/import');
    revalidatePath('/reconciliation');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not discard import.' };
  }
}

/** Re-export period for clients that only need summary after reload */
export async function getStatementImportSummary(importId: string) {
  return getStatementImport(importId);
}

/**
 * BIS-5: Run (or re-run) match engine on a committed studio/legacy import.
 * Staging only — no journals. Proposes link / review / create.
 * Skips lines already reconciled / created / skipped / duplicate.
 */
export async function runStatementMatchPass(importId: string): Promise<
  | { ok: true; view: StatementImportView; stats: MatchPassStats }
  | { ok: false; error: string }
> {
  try {
    const id = z.string().uuid().parse(importId);
    const user = await requireTenantContext();

    const result = await withTenantContext(user.tenantId, async () => {
      const [imp] = await db()
        .select({
          id: bankStatementImports.id,
          bankAccountId: bankStatementImports.bankAccountId,
          bookDomain: bankStatementImports.bookDomain,
          periodFrom: bankStatementImports.periodFrom,
          periodTo: bankStatementImports.periodTo,
          wizardStatus: bankStatementImports.wizardStatus,
          status: bankStatementImports.status,
        })
        .from(bankStatementImports)
        .where(
          and(
            eq(bankStatementImports.id, id),
            eq(bankStatementImports.tenantId, user.tenantId),
            isNull(bankStatementImports.voidedAt),
          ),
        )
        .limit(1);
      if (!imp) throw new Error('Import not found.');
      if (!imp.bankAccountId) throw new Error('Import has no bank account.');

      const lineRows = await db()
        .select({
          id: bankStatementLines.id,
          rowNumber: bankStatementLines.rowNumber,
          transactionDate: bankStatementLines.transactionDate,
          description: bankStatementLines.description,
          amount: bankStatementLines.amount,
          direction: bankStatementLines.direction,
          status: bankStatementLines.status,
          fingerprint: bankStatementLines.fingerprint,
          externalRef: bankStatementLines.externalRef,
          confidence: bankStatementLines.confidence,
          balanceAfter: bankStatementLines.balanceAfter,
          raw: bankStatementLines.raw,
          matchedTransactionId: bankStatementLines.matchedTransactionId,
        })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.importId, id),
            eq(bankStatementLines.tenantId, user.tenantId),
            isNull(bankStatementLines.voidedAt),
          ),
        )
        .orderBy(bankStatementLines.rowNumber);

      const finalized = new Set(['reconciled', 'created', 'skipped', 'duplicate']);
      const open = lineRows.filter((l) => !finalized.has(l.status));
      if (open.length === 0) {
        const view = await loadImportView(user.tenantId, id);
        if (!view) throw new Error('Import not found.');
        return {
          view,
          stats: {
            link: 0,
            review: 0,
            create: 0,
            leftAlone: lineRows.length,
            total: lineRows.length,
          } satisfies MatchPassStats,
        };
      }

      // Books already claimed by finalized lines in this import
      const claimed = new Set<string>();
      for (const l of lineRows) {
        if (finalized.has(l.status) && l.matchedTransactionId) {
          claimed.add(l.matchedTransactionId);
        }
      }

      const periodFrom =
        imp.periodFrom ??
        open.reduce((min, l) => (l.transactionDate < min ? l.transactionDate : min), open[0]!.transactionDate);
      const periodTo =
        imp.periodTo ??
        open.reduce((max, l) => (l.transactionDate > max ? l.transactionDate : max), open[0]!.transactionDate);

      const books = await loadBookCandidates(
        user.tenantId,
        imp.bankAccountId,
        periodFrom,
        periodTo,
        imp.bookDomain,
      );
      const freeBooks = books.filter((b) => !claimed.has(b.id));

      const canonical: CanonicalStatementLine[] = open.map((l) => {
        const amountSigned = Number(l.amount);
        const direction =
          l.direction === 'in' || l.direction === 'out' || l.direction === 'unknown'
            ? l.direction
            : amountSigned > 0
              ? 'in'
              : amountSigned < 0
                ? 'out'
                : 'unknown';
        return {
          rowNumber: Number(l.rowNumber),
          date: l.transactionDate,
          description: l.description,
          amountSigned,
          direction,
          balanceAfter: l.balanceAfter != null ? Number(l.balanceAfter) : undefined,
          externalRef: l.externalRef ?? undefined,
          fingerprint: l.fingerprint ?? `row-${l.id}`,
          dateConfidence: l.confidence != null ? Number(l.confidence) : 0.9,
          raw: (l.raw as Record<string, unknown>) ?? {},
        };
      });

      const matches = matchAll(canonical, freeBooks);
      const byRow = new Map(matches.map((m) => [m.line.rowNumber, m]));

      let link = 0;
      let review = 0;
      let create = 0;

      for (const line of open) {
        const m = byRow.get(Number(line.rowNumber));
        if (!m) continue;
        let action = m.proposedAction;
        // Balance flag from raw
        const flags = extractFlags(line.raw, null);
        if (flags.includes('BALANCE_BREAK') && action === 'link') {
          action = 'review';
        }
        let status = mapActionToStatus(action, Boolean(m.matchedTransactionId));
        // Studio leftover status "imported" becomes proper staging status
        if (status === 'matched') link += 1;
        else if (status === 'review') review += 1;
        else {
          create += 1;
          status = 'unmatched';
        }

        await db()
          .update(bankStatementLines)
          .set({
            status,
            proposedAction: action,
            matchScore: m.matchScore.toFixed(4),
            matchMethod: m.matchMethod,
            matchCandidates: m.candidates,
            matchedTransactionId: action === 'link' ? m.matchedTransactionId : null,
            confidence: m.confidence.toFixed(4),
            reconciliationStatus:
              action === 'link' ? 'suggested' : action === 'review' ? 'review' : 'unmatched',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bankStatementLines.id, line.id),
              eq(bankStatementLines.tenantId, user.tenantId),
            ),
          );
      }

      await db().insert(bankStatementImportEvents).values({
        tenantId: user.tenantId,
        importId: id,
        userId: user.id,
        action: 'match_pass',
        detail: {
          open: open.length,
          link,
          review,
          create,
          bookCandidates: freeBooks.length,
        },
      });

      await refreshImportCounts(id, user.tenantId);
      // Keep studio committed imports usable after match
      await db()
        .update(bankStatementImports)
        .set({
          wizardStep: 'match',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bankStatementImports.id, id),
            eq(bankStatementImports.tenantId, user.tenantId),
          ),
        );

      const view = await loadImportView(user.tenantId, id);
      if (!view) throw new Error('Import not found after match.');
      return {
        view,
        stats: {
          link,
          review,
          create,
          leftAlone: lineRows.length - open.length,
          total: lineRows.length,
        } satisfies MatchPassStats,
      };
    });

    revalidatePath('/cashbook');
    revalidatePath('/cashbook/import');
    revalidatePath('/cashbook/match');
    revalidatePath('/reconciliation');
    revalidatePath('/transactions');
    return { ok: true, view: result.view, stats: result.stats };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not match bank lines to books.',
    };
  }
}

/**
 * Search book entries for manual match (pass 3).
 */
export async function searchBookCandidatesForMatch(input: {
  importId: string;
  lineId?: string;
  query?: string;
  limit?: number;
}): Promise<{ ok: true; candidates: MatchCandidateView[] } | { ok: false; error: string }> {
  try {
    const importId = z.string().uuid().parse(input.importId);
    const user = await requireTenantContext();
    const limit = Math.min(Math.max(input.limit ?? 12, 1), 40);

    const candidates = await withTenantContext(user.tenantId, async () => {
      const [imp] = await db()
        .select({
          bankAccountId: bankStatementImports.bankAccountId,
          bookDomain: bankStatementImports.bookDomain,
          periodFrom: bankStatementImports.periodFrom,
          periodTo: bankStatementImports.periodTo,
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
      if (!imp?.bankAccountId) throw new Error('Import not found.');

      let periodFrom = imp.periodFrom;
      let periodTo = imp.periodTo;
      let amountHint: number | null = null;
      if (input.lineId && z.string().uuid().safeParse(input.lineId).success) {
        const [line] = await db()
          .select({
            date: bankStatementLines.transactionDate,
            amount: bankStatementLines.amount,
          })
          .from(bankStatementLines)
          .where(
            and(
              eq(bankStatementLines.id, input.lineId),
              eq(bankStatementLines.tenantId, user.tenantId),
            ),
          )
          .limit(1);
        if (line) {
          periodFrom = line.date;
          periodTo = line.date;
          amountHint = Number(line.amount);
        }
      }

      const books = await loadBookCandidates(
        user.tenantId,
        imp.bankAccountId,
        periodFrom,
        periodTo,
        imp.bookDomain,
      );

      const q = (input.query ?? '').trim().toLowerCase();
      let list = books;
      if (amountHint != null && Number.isFinite(amountHint)) {
        const abs = Math.abs(amountHint);
        list = list.filter((b) => Math.abs(Math.abs(b.amountSigned) - abs) < 0.02);
      }
      if (q) {
        list = list.filter(
          (b) =>
            b.description.toLowerCase().includes(q) ||
            b.date.includes(q) ||
            String(b.amountSigned).includes(q),
        );
      }
      // Prefer closer amounts if no query
      if (amountHint != null) {
        const abs = Math.abs(amountHint);
        list = [...list].sort(
          (a, b) =>
            Math.abs(Math.abs(a.amountSigned) - abs) - Math.abs(Math.abs(b.amountSigned) - abs),
        );
      }

      return list.slice(0, limit).map((b) => ({
        id: b.id,
        score: 0,
        date: b.date,
        description: b.description,
        amountSigned: b.amountSigned,
      }));
    });

    return { ok: true, candidates };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not search book entries.',
    };
  }
}

/**
 * Mark open review/create lines as unmatched skip (stay unmatched for later create).
 * Does not write journals.
 */
export async function markLinesUnmatched(input: {
  importId: string;
  lineIds: string[];
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const importId = z.string().uuid().parse(input.importId);
    const lineIds = input.lineIds.filter((id) => z.string().uuid().safeParse(id).success);
    if (lineIds.length === 0) return { ok: true, count: 0 };
    const user = await requireTenantContext();

    const count = await withTenantContext(user.tenantId, async () => {
      let n = 0;
      for (const lineId of lineIds) {
        const [line] = await db()
          .select({ id: bankStatementLines.id, status: bankStatementLines.status })
          .from(bankStatementLines)
          .where(
            and(
              eq(bankStatementLines.id, lineId),
              eq(bankStatementLines.importId, importId),
              eq(bankStatementLines.tenantId, user.tenantId),
              isNull(bankStatementLines.voidedAt),
            ),
          )
          .limit(1);
        if (!line) continue;
        if (['reconciled', 'created', 'skipped', 'duplicate'].includes(line.status)) continue;
        await db()
          .update(bankStatementLines)
          .set({
            status: 'unmatched',
            proposedAction: 'create',
            matchedTransactionId: null,
            matchMethod: 'none',
            reconciliationStatus: 'unmatched',
            reviewedByUserId: user.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bankStatementLines.id, lineId),
              eq(bankStatementLines.tenantId, user.tenantId),
            ),
          );
        n += 1;
      }
      await refreshImportCounts(importId, user.tenantId);
      return n;
    });

    revalidatePath('/cashbook/match');
    revalidatePath('/reconciliation');
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not update lines.' };
  }
}
