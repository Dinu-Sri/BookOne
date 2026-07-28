'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  annotateBalanceContinuity,
  fileSha256,
  matchAll,
  parseStatementFile,
  type BookCandidate,
  type MatchResult,
  type ParseProfile,
  type ProposedAction,
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
  candidates: { id: string; score: number }[];
  /** SI-4 flags e.g. BALANCE_BREAK */
  flags: string[];
  month: string;
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

function toLineView(row: {
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
}): StatementLineView {
  const candidates = Array.isArray(row.matchCandidates)
    ? (row.matchCandidates as { id: string; score: number }[])
    : [];
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

  const lines = lineRows.map(toLineView);
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

    const learned = await loadBestProfile(tenantId, bank.name);
    const parsed = parseStatementFile(Buffer.from(bytes), fileName, {
      tenantId,
      bankAccountId,
      profile: learned?.profile ?? null,
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
    if (learned) {
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
            warnings,
            multiMonth,
            profileName: parsed.profile.name,
            profileAuto: parsed.profileAuto,
            profileLearned: Boolean(learned),
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
    const result = await commitOneFileBuffer({
      tenantId: user.tenantId,
      userId: user.id,
      bankAccountId,
      bookDomain,
      source,
      fileName: file.name,
      bytes,
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
}): Promise<{ ok: true; created: number; errors: string[] } | { ok: false; error: string }> {
  try {
    const importId = z.string().uuid().parse(input.importId);
    const user = await requireTenantContext();
    const expenseCode = (input.defaultExpenseCode ?? '6800').slice(0, 20);
    const incomeCode = (input.defaultIncomeCode ?? '4300').slice(0, 20);

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

      const conditions = [
        eq(bankStatementLines.tenantId, user.tenantId),
        eq(bankStatementLines.importId, importId),
        isNull(bankStatementLines.voidedAt),
        eq(bankStatementLines.proposedAction, 'create'),
        inArray(bankStatementLines.status, ['unmatched', 'review']),
        isNull(bankStatementLines.createdTransactionId),
      ];
      if (input.lineIds?.length) {
        conditions.push(inArray(bankStatementLines.id, input.lineIds));
      }

      const lines = await db()
        .select({
          id: bankStatementLines.id,
          date: bankStatementLines.transactionDate,
          description: bankStatementLines.description,
          amount: bankStatementLines.amount,
          fingerprint: bankStatementLines.fingerprint,
        })
        .from(bankStatementLines)
        .where(and(...conditions));

      const periods = [...new Set(lines.map((l) => l.date.slice(0, 7)))];
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
        lines,
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
            categoryOverride: incomeCode,
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
            categoryOverride: expenseCode,
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
            createdTransactionId: entryResult.transactionId,
            matchedTransactionId: entryResult.transactionId,
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
          detail: { transactionId: entryResult.transactionId },
        });
      });
      created += 1;
    }

    await withTenantContext(user.tenantId, async () => {
      await refreshImportCounts(importId, user.tenantId);
      await learnProfileFromImport(user.tenantId, importId);
    });

    revalidatePath('/cashbook');
    revalidatePath('/cashbook/import');
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
