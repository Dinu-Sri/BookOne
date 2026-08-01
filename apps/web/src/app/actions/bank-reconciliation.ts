'use server';

/**
 * Bank Reconciliation Workbench — sessions + cases.
 * Authority: docs/BANK_RECONCILIATION_WORKBENCH.md
 * Staging remains bank_statement_*; this module is recon state.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { matchAll, type BookCandidate, type CanonicalStatementLine } from '@bookone/statement-import';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  and,
  bankReconciliationCaseBankLines,
  bankReconciliationCaseBookTransactions,
  bankReconciliationCases,
  bankReconciliationEvents,
  bankReconciliationOutstandingItems,
  bankReconciliationSessionImports,
  bankReconciliationSessions,
  bankStatementImports,
  bankStatementLines,
  db,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  transactions,
  withTenantContext,
} from '@bookone/db';

// ─── Types ───────────────────────────────────────────────────────────

export type ReconCaseType =
  | 'match_1_1'
  | 'create_entry'
  | 'outstanding_book'
  | 'duplicate'
  | 'excluded';

export type ReconCaseState =
  | 'suggested'
  | 'needs_review'
  | 'confirmed'
  | 'deferred'
  | 'excluded'
  | 'reopened';

export type ReconSessionListItem = {
  id: string;
  bankAccountId: string;
  bankName: string;
  bankCode: string;
  periodFrom: string;
  periodTo: string;
  periodLabel: string;
  status: string;
  statusLabel: string;
  sourceFileCount: number;
  bankLineCount: number;
  resolvedCaseCount: number;
  openCaseCount: number;
  differenceAmount: number;
  progressPct: number;
  updatedAt: string;
};

export type ReconCaseRow = {
  id: string;
  caseType: string;
  confidence: string;
  state: string;
  matchScore: number | null;
  matchMethod: string | null;
  explanation: string | null;
  reasonCodes: string[];
  userLabel: string | null;
  resultLabel: string | null;
  sortDate: string | null;
  sortAmount: number | null;
  connection: 'match' | 'bank_only' | 'book_only';
  bank: {
    lineId: string | null;
    date: string | null;
    description: string | null;
    amount: number | null;
  };
  book: {
    transactionId: string | null;
    date: string | null;
    description: string | null;
    amount: number | null;
  };
  candidates: { id: string; score: number; date: string; description: string; amountSigned: number }[];
};

export type ReconSessionDetail = {
  session: ReconSessionListItem & {
    version: number;
    statementClosingBalance: number | null;
    bookClosingBalance: number | null;
    outstandingNet: number;
    sourceFiles: { importId: string; fileName: string }[];
  };
  /** Resolved tab after 'auto' preference */
  activeTab: string;
  tabCounts: Record<string, number>;
  cases: ReconCaseRow[];
  page: number;
  pageSize: number;
  totalCases: number;
};

function revalidateRecon() {
  revalidatePath('/reconciliation');
  revalidatePath('/cashbook/bank-imports');
  revalidatePath('/cashbook/match');
  revalidatePath('/cashbook');
}

function formatPeriodLabel(from: string, to: string) {
  if (from === to) return from;
  try {
    const a = new Date(`${from}T12:00:00`);
    const b = new Date(`${to}T12:00:00`);
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    const sameMonth =
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
    if (sameMonth) {
      return `${a.getDate()}–${b.getDate()} ${a.toLocaleString('en-GB', { month: 'short', year: 'numeric' })}`;
    }
    return `${a.toLocaleString('en-GB', opts)} – ${b.toLocaleString('en-GB', opts)}`;
  } catch {
    return `${from} → ${to}`;
  }
}

/** Prefer real bank-line dates; for long spans pick the densest calendar month (most lines). */
function normalizePeriodFromDates(
  minD: string | null | undefined,
  maxD: string | null | undefined,
  fallbackFrom?: string | null,
  fallbackTo?: string | null,
  allDates?: string[],
): { periodFrom: string; periodTo: string } {
  let periodFrom =
    minD || fallbackFrom || new Date().toISOString().slice(0, 10);
  let periodTo = maxD || fallbackTo || periodFrom;
  if (periodFrom && periodTo && periodFrom.slice(0, 7) !== periodTo.slice(0, 7)) {
    const months =
      (Number(periodTo.slice(0, 4)) - Number(periodFrom.slice(0, 4))) * 12 +
      (Number(periodTo.slice(5, 7)) - Number(periodFrom.slice(5, 7)));
    if (months > 2) {
      // Prefer month with the most bank lines — end month is often nearly empty
      let ym = periodTo.slice(0, 7);
      if (allDates && allDates.length > 0) {
        const counts = new Map<string, number>();
        for (const d of allDates) {
          if (!d || d.length < 7) continue;
          const k = d.slice(0, 7);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        let bestN = -1;
        for (const [k, n] of counts) {
          if (n > bestN) {
            bestN = n;
            ym = k;
          }
        }
      }
      const [y, m] = ym.split('-').map(Number);
      const last = new Date(y!, m!, 0).getDate();
      periodFrom = `${ym}-01`;
      periodTo = `${ym}-${String(last).padStart(2, '0')}`;
    }
  }
  return { periodFrom, periodTo };
}

function statusLabel(status: string) {
  switch (status) {
    case 'ready':
      return 'Ready to reconcile';
    case 'in_progress':
      return 'In progress';
    case 'reconciled':
      return 'Reconciled';
    case 'draft':
      return 'Draft';
    default:
      return status;
  }
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
    if (paymentAccountId === bankAccountId) return amount;
    if (transferSourceAccountId === bankAccountId) return -amount;
  }
  return null;
}

async function loadBookCandidates(
  tenantId: string,
  bankAccountId: string,
  periodFrom: string,
  periodTo: string,
  bookDomain: string | null | undefined,
): Promise<(BookCandidate & { paymentAccountId: string })[]> {
  const from = new Date(`${periodFrom}T12:00:00`);
  const to = new Date(`${periodTo}T12:00:00`);
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

  const out: (BookCandidate & { paymentAccountId: string })[] = [];
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
      paymentAccountId: r.paymentAccountId,
    });
  }
  return out;
}

async function bookBalanceThrough(
  tenantId: string,
  bankAccountId: string,
  asOf: string,
): Promise<number> {
  const rows = await db()
    .select({
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
        lte(transactions.date, asOf),
        or(
          eq(transactions.paymentAccountId, bankAccountId),
          eq(transactions.transferSourceAccountId, bankAccountId),
        ),
      ),
    );
  let bal = 0;
  for (const r of rows) {
    const s = bookSignedAmount(
      r.direction,
      Number(r.amount),
      r.paymentAccountId,
      r.transferSourceAccountId,
      bankAccountId,
    );
    if (s != null) bal += s;
  }
  return Math.round(bal * 100) / 100;
}

async function refreshSessionCounts(tenantId: string, sessionId: string) {
  const cases = await db()
    .select({
      state: bankReconciliationCases.state,
      caseType: bankReconciliationCases.caseType,
    })
    .from(bankReconciliationCases)
    .where(
      and(
        eq(bankReconciliationCases.sessionId, sessionId),
        eq(bankReconciliationCases.tenantId, tenantId),
        isNull(bankReconciliationCases.voidedAt),
      ),
    );

  const resolved = cases.filter((c) =>
    ['confirmed', 'excluded'].includes(c.state),
  ).length;
  const open = cases.length - resolved;

  const files = await db()
    .select({ id: bankReconciliationSessionImports.id })
    .from(bankReconciliationSessionImports)
    .where(eq(bankReconciliationSessionImports.sessionId, sessionId));

  let status = 'ready';
  if (resolved > 0 && open > 0) status = 'in_progress';
  if (cases.length > 0 && open === 0) status = 'in_progress'; // finish later sets reconciled

  await db()
    .update(bankReconciliationSessions)
    .set({
      resolvedCaseCount: resolved,
      openCaseCount: open,
      sourceFileCount: files.length,
      status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bankReconciliationSessions.id, sessionId),
        eq(bankReconciliationSessions.tenantId, tenantId),
      ),
    );
}

async function logEvent(
  tenantId: string,
  sessionId: string,
  userId: string,
  action: string,
  opts?: { caseId?: string; before?: unknown; after?: unknown; reason?: string },
) {
  await db().insert(bankReconciliationEvents).values({
    tenantId,
    sessionId,
    caseId: opts?.caseId ?? null,
    userId,
    action,
    beforeValues: (opts?.before as Record<string, unknown>) ?? null,
    afterValues: (opts?.after as Record<string, unknown>) ?? null,
    reason: opts?.reason ?? null,
  });
}

// ─── Public actions ──────────────────────────────────────────────────

/**
 * Attach a committed bank import to a session (create session if needed).
 */
export async function getOrCreateSessionFromImport(
  importId: string,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  try {
    const id = z.string().uuid().parse(importId);
    const user = await requireTenantContext();

    const sessionId = await withTenantContext(user.tenantId, async () => {
      const [imp] = await db()
        .select({
          id: bankStatementImports.id,
          bankAccountId: bankStatementImports.bankAccountId,
          bookDomain: bankStatementImports.bookDomain,
          periodFrom: bankStatementImports.periodFrom,
          periodTo: bankStatementImports.periodTo,
          period: bankStatementImports.period,
          wizardStatus: bankStatementImports.wizardStatus,
          status: bankStatementImports.status,
          openingBalance: bankStatementImports.openingBalance,
          closingBalance: bankStatementImports.closingBalance,
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

      // Already attached?
      const [existingLink] = await db()
        .select({ sessionId: bankReconciliationSessionImports.sessionId })
        .from(bankReconciliationSessionImports)
        .where(
          and(
            eq(bankReconciliationSessionImports.importId, id),
            eq(bankReconciliationSessionImports.tenantId, user.tenantId),
          ),
        )
        .limit(1);
      if (existingLink) {
        await rebuildSessionSuggestionsInternal(user.tenantId, user.id, existingLink.sessionId);
        return existingLink.sessionId;
      }

      // Prefer actual bank-line date span (import periodFrom/To can be multi-year noise)
      const dateSpan = await db()
        .select({
          minD: sql<string>`min(${bankStatementLines.transactionDate})`,
          maxD: sql<string>`max(${bankStatementLines.transactionDate})`,
        })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.importId, id),
            eq(bankStatementLines.tenantId, user.tenantId),
            isNull(bankStatementLines.voidedAt),
          ),
        );
      const dateList = await db()
        .select({ d: bankStatementLines.transactionDate })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.importId, id),
            eq(bankStatementLines.tenantId, user.tenantId),
            isNull(bankStatementLines.voidedAt),
          ),
        );
      const { periodFrom, periodTo } = normalizePeriodFromDates(
        dateSpan[0]?.minD,
        dateSpan[0]?.maxD,
        imp.periodFrom || (imp.period ? `${imp.period}-01` : null),
        imp.periodTo || null,
        dateList.map((r) => r.d),
      );

      // Find session for same bank + period
      let [session] = await db()
        .select({ id: bankReconciliationSessions.id })
        .from(bankReconciliationSessions)
        .where(
          and(
            eq(bankReconciliationSessions.tenantId, user.tenantId),
            eq(bankReconciliationSessions.bankAccountId, imp.bankAccountId),
            eq(bankReconciliationSessions.periodFrom, periodFrom),
            eq(bankReconciliationSessions.periodTo, periodTo),
            isNull(bankReconciliationSessions.voidedAt),
          ),
        )
        .limit(1);

      if (!session) {
        const bookClose = await bookBalanceThrough(
          user.tenantId,
          imp.bankAccountId,
          periodTo,
        );
        const [created] = await db()
          .insert(bankReconciliationSessions)
          .values({
            tenantId: user.tenantId,
            bankAccountId: imp.bankAccountId,
            bookDomain: imp.bookDomain,
            periodFrom,
            periodTo,
            status: 'ready',
            statementOpeningBalance: imp.openingBalance,
            statementClosingBalance: imp.closingBalance,
            bookClosingBalanceSnapshot: bookClose.toFixed(2),
            preparedBy: user.id,
            sourceFileCount: 1,
          })
          .returning({ id: bankReconciliationSessions.id });
        session = created;
        await logEvent(user.tenantId, session.id, user.id, 'session_created', {
          after: { periodFrom, periodTo, bankAccountId: imp.bankAccountId },
        });
      }

      await db().insert(bankReconciliationSessionImports).values({
        tenantId: user.tenantId,
        sessionId: session.id,
        importId: id,
        attachedBy: user.id,
      });

      await logEvent(user.tenantId, session.id, user.id, 'import_attached', {
        after: { importId: id },
      });

      await rebuildSessionSuggestionsInternal(user.tenantId, user.id, session.id);
      return session.id;
    });

    revalidateRecon();
    return { ok: true, sessionId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not open session.' };
  }
}

/**
 * Rebuild match suggestions for a session (idempotent for confirmed cases).
 */
type RebuildSeedStats = {
  lines: number;
  workLines: number;
  openBank: number;
  lockedBank: number;
  freeBooks: number;
  createdMatch: number;
  createdAdd: number;
  createdWait: number;
  statusSample: Record<string, number>;
  periodFrom: string;
  periodTo: string;
};

async function rebuildSessionSuggestionsInternal(
  tenantId: string,
  userId: string,
  sessionId: string,
): Promise<RebuildSeedStats> {
  const [session] = await db()
    .select()
    .from(bankReconciliationSessions)
    .where(
      and(
        eq(bankReconciliationSessions.id, sessionId),
        eq(bankReconciliationSessions.tenantId, tenantId),
        isNull(bankReconciliationSessions.voidedAt),
      ),
    )
    .limit(1);
  if (!session) throw new Error('Session not found.');

  // Confirmed bank lines / book txs — skip reseeding
  const confirmedJoins = await db()
    .select({
      bankLineId: bankReconciliationCaseBankLines.bankLineId,
      transactionId: bankReconciliationCaseBookTransactions.transactionId,
      caseState: bankReconciliationCases.state,
    })
    .from(bankReconciliationCases)
    .leftJoin(
      bankReconciliationCaseBankLines,
      and(
        eq(bankReconciliationCaseBankLines.caseId, bankReconciliationCases.id),
        isNull(bankReconciliationCaseBankLines.voidedAt),
      ),
    )
    .leftJoin(
      bankReconciliationCaseBookTransactions,
      and(
        eq(bankReconciliationCaseBookTransactions.caseId, bankReconciliationCases.id),
        isNull(bankReconciliationCaseBookTransactions.voidedAt),
      ),
    )
    .where(
      and(
        eq(bankReconciliationCases.sessionId, sessionId),
        eq(bankReconciliationCases.tenantId, tenantId),
        isNull(bankReconciliationCases.voidedAt),
        inArray(bankReconciliationCases.state, ['confirmed', 'excluded']),
      ),
    );

  const lockedBankLines = new Set(
    confirmedJoins.map((j) => j.bankLineId).filter(Boolean) as string[],
  );
  const lockedBooks = new Set(
    confirmedJoins.map((j) => j.transactionId).filter(Boolean) as string[],
  );

  // Void non-confirmed cases before reseed
  const openCases = await db()
    .select({ id: bankReconciliationCases.id })
    .from(bankReconciliationCases)
    .where(
      and(
        eq(bankReconciliationCases.sessionId, sessionId),
        eq(bankReconciliationCases.tenantId, tenantId),
        isNull(bankReconciliationCases.voidedAt),
        inArray(bankReconciliationCases.state, ['suggested', 'needs_review', 'deferred', 'reopened']),
      ),
    );
  const openIds = openCases.map((c) => c.id);
  if (openIds.length > 0) {
    const now = new Date();
    await db()
      .update(bankReconciliationCases)
      .set({ voidedAt: now, updatedAt: now })
      .where(inArray(bankReconciliationCases.id, openIds));
    await db()
      .update(bankReconciliationCaseBankLines)
      .set({ voidedAt: now })
      .where(inArray(bankReconciliationCaseBankLines.caseId, openIds));
    await db()
      .update(bankReconciliationCaseBookTransactions)
      .set({ voidedAt: now })
      .where(inArray(bankReconciliationCaseBookTransactions.caseId, openIds));
  }

  // Collect bank lines from attached imports
  const links = await db()
    .select({ importId: bankReconciliationSessionImports.importId })
    .from(bankReconciliationSessionImports)
    .where(eq(bankReconciliationSessionImports.sessionId, sessionId));

  const importIds = links.map((l) => l.importId);
  if (importIds.length === 0) {
    await refreshSessionCounts(tenantId, sessionId);
    return {
      lines: 0,
      workLines: 0,
      openBank: 0,
      lockedBank: lockedBankLines.size,
      freeBooks: 0,
      createdMatch: 0,
      createdAdd: 0,
      createdWait: 0,
      statusSample: {},
      periodFrom: session.periodFrom,
      periodTo: session.periodTo,
    };
  }

  const lines = await db()
    .select({
      id: bankStatementLines.id,
      rowNumber: bankStatementLines.rowNumber,
      date: bankStatementLines.transactionDate,
      description: bankStatementLines.description,
      amount: bankStatementLines.amount,
      direction: bankStatementLines.direction,
      status: bankStatementLines.status,
      fingerprint: bankStatementLines.fingerprint,
      confidence: bankStatementLines.confidence,
      matchScore: bankStatementLines.matchScore,
      matchMethod: bankStatementLines.matchMethod,
      matchedTransactionId: bankStatementLines.matchedTransactionId,
      proposedAction: bankStatementLines.proposedAction,
    })
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.tenantId, tenantId),
        isNull(bankStatementLines.voidedAt),
        inArray(bankStatementLines.importId, importIds),
      ),
    );

  // Heal multi-year / wrong session periods from actual bank lines (densest month)
  const liveDates = lines
    .filter((l) => !['duplicate', 'skipped'].includes(l.status ?? ''))
    .map((l) => l.date)
    .filter(Boolean)
    .sort();
  if (liveDates.length > 0) {
    const healed = normalizePeriodFromDates(
      liveDates[0],
      liveDates[liveDates.length - 1],
      session.periodFrom,
      session.periodTo,
      liveDates,
    );
    // Also re-heal if current period has almost no lines vs the file
    const inCurrent = liveDates.filter(
      (d) => d >= session.periodFrom && d <= session.periodTo,
    ).length;
    const periodTooThin =
      liveDates.length > 20 && inCurrent < Math.max(5, Math.floor(liveDates.length * 0.15));
    if (
      healed.periodFrom !== session.periodFrom ||
      healed.periodTo !== session.periodTo ||
      periodTooThin
    ) {
      const target = periodTooThin
        ? normalizePeriodFromDates(liveDates[0], liveDates[liveDates.length - 1], null, null, liveDates)
        : healed;
      // Avoid unique-index clash with an existing session for the densest month
      const [clash] = await db()
        .select({ id: bankReconciliationSessions.id })
        .from(bankReconciliationSessions)
        .where(
          and(
            eq(bankReconciliationSessions.tenantId, tenantId),
            eq(bankReconciliationSessions.bankAccountId, session.bankAccountId),
            eq(bankReconciliationSessions.periodFrom, target.periodFrom),
            eq(bankReconciliationSessions.periodTo, target.periodTo),
            isNull(bankReconciliationSessions.voidedAt),
            sql`${bankReconciliationSessions.id} <> ${sessionId}`,
          ),
        )
        .limit(1);
      if (!clash) {
        await db()
          .update(bankReconciliationSessions)
          .set({
            periodFrom: target.periodFrom,
            periodTo: target.periodTo,
            updatedAt: new Date(),
          })
          .where(eq(bankReconciliationSessions.id, sessionId));
        session.periodFrom = target.periodFrom;
        session.periodTo = target.periodTo;
      }
    }
  }

  // Backfill statement balances from attached imports when missing
  if (session.statementClosingBalance == null || session.statementOpeningBalance == null) {
    const [impBal] = await db()
      .select({
        opening: bankStatementImports.openingBalance,
        closing: bankStatementImports.closingBalance,
      })
      .from(bankStatementImports)
      .where(
        and(
          inArray(bankStatementImports.id, importIds),
          eq(bankStatementImports.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (impBal) {
      await db()
        .update(bankReconciliationSessions)
        .set({
          statementOpeningBalance:
            session.statementOpeningBalance ?? impBal.opening ?? null,
          statementClosingBalance:
            session.statementClosingBalance ?? impBal.closing ?? null,
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationSessions.id, sessionId));
      session.statementOpeningBalance =
        session.statementOpeningBalance ?? impBal.opening ?? null;
      session.statementClosingBalance =
        session.statementClosingBalance ?? impBal.closing ?? null;
    }
  }

  // Scope bank lines to the session period (multi-year files are capped to one month)
  const inPeriod = lines.filter(
    (l) => l.date >= session.periodFrom && l.date <= session.periodTo,
  );
  const workLines = inPeriod.length > 0 ? inPeriod : lines;

  // Already reconciled / created lines (from prior match wizard) → seed confirmed cases
  // Do NOT drop bank lines with status reconciled/created from the open pool when they
  // have no usable book link — that left 0 bank-side cases and a book-only flood.
  for (const l of workLines) {
    if (lockedBankLines.has(l.id)) continue;
    if (['duplicate', 'skipped'].includes(l.status ?? '')) {
      if (l.status === 'duplicate') {
        const [c] = await db()
          .insert(bankReconciliationCases)
          .values({
            tenantId,
            sessionId,
            caseType: 'duplicate',
            confidence: 'strong',
            state: 'excluded',
            explanation: 'Already imported earlier for this bank.',
            reasonCodes: ['duplicate_fingerprint'],
            userLabel: 'Duplicate',
            resultLabel: 'Excluded',
            sortDate: l.date,
            sortAmount: l.amount,
            exclusionReason: 'duplicate_import',
          })
          .returning({ id: bankReconciliationCases.id });
        await db().insert(bankReconciliationCaseBankLines).values({
          tenantId,
          caseId: c.id,
          bankLineId: l.id,
        });
        lockedBankLines.add(l.id);
      }
      continue;
    }
    const priorBookId = l.matchedTransactionId ?? null;
    if (
      priorBookId &&
      (l.status === 'reconciled' || l.status === 'matched' || l.status === 'created') &&
      !lockedBooks.has(priorBookId)
    ) {
      const [c] = await db()
        .insert(bankReconciliationCases)
        .values({
          tenantId,
          sessionId,
          caseType: 'match_1_1',
          confidence: 'strong',
          state: 'confirmed',
          matchScore: l.matchScore,
          matchMethod: l.matchMethod ?? 'exact',
          explanation: 'Previously linked to a BookOne entry.',
          reasonCodes: ['prior_link'],
          userLabel: 'Matched',
          resultLabel: 'Confirmed',
          sortDate: l.date,
          sortAmount: l.amount,
          confirmedAt: new Date(),
        })
        .returning({ id: bankReconciliationCases.id });
      await db().insert(bankReconciliationCaseBankLines).values({
        tenantId,
        caseId: c.id,
        bankLineId: l.id,
        allocatedAmount: l.amount,
      });
      await db().insert(bankReconciliationCaseBookTransactions).values({
        tenantId,
        caseId: c.id,
        transactionId: priorBookId,
        allocatedAmount: l.amount,
      });
      lockedBankLines.add(l.id);
      lockedBooks.add(priorBookId);
    }
  }

  // Status histogram for diagnostics
  const statusSample: Record<string, number> = {};
  for (const l of workLines) {
    const st = l.status ?? '(null)';
    statusSample[st] = (statusSample[st] ?? 0) + 1;
  }

  // Every non-duplicate bank line in period that is not already a confirmed case stays open
  // Include reconciled/created/matched without a locked prior link (legacy match-wizard residue)
  const openBankLines = workLines.filter(
    (l) =>
      !lockedBankLines.has(l.id) &&
      !['duplicate', 'skipped'].includes(String(l.status ?? '').toLowerCase()),
  );
  const books = await loadBookCandidates(
    tenantId,
    session.bankAccountId,
    session.periodFrom,
    session.periodTo,
    session.bookDomain,
  );
  const freeBooks = books.filter((b) => !lockedBooks.has(b.id));

  let createdMatch = 0;
  let createdAdd = 0;
  let createdWait = 0;
  const usedBooks = new Set<string>();

  // Pair by array index (matchAll preserves input order) — avoid rowNumber key collisions
  try {
    const canonical: CanonicalStatementLine[] = openBankLines.map((l, idx) => {
      const amountSigned = Number(l.amount);
      return {
        rowNumber: Number.isFinite(Number(l.rowNumber)) ? Number(l.rowNumber) : idx + 1,
        date: String(l.date ?? '').slice(0, 10),
        description: l.description ?? '',
        amountSigned: Number.isFinite(amountSigned) ? amountSigned : 0,
        direction:
          l.direction === 'in' || l.direction === 'out'
            ? l.direction
            : amountSigned > 0
              ? 'in'
              : amountSigned < 0
                ? 'out'
                : 'unknown',
        fingerprint: l.fingerprint ?? l.id,
        dateConfidence: l.confidence != null ? Number(l.confidence) : 0.9,
        raw: {},
      };
    });

    const matches = matchAll(canonical, freeBooks);

    for (let i = 0; i < openBankLines.length; i++) {
      const line = openBankLines[i]!;
      const m = matches[i];
      if (!m) continue;
      const amt = Number(line.amount);
      const amtStr = Number.isFinite(amt) ? amt.toFixed(2) : '0.00';

      if (m.proposedAction === 'link' && m.matchedTransactionId && !usedBooks.has(m.matchedTransactionId)) {
        usedBooks.add(m.matchedTransactionId);
        lockedBooks.add(m.matchedTransactionId);
        const [c] = await db()
          .insert(bankReconciliationCases)
          .values({
            tenantId,
            sessionId,
            caseType: 'match_1_1',
            confidence: m.matchMethod === 'exact' || m.matchScore >= 0.95 ? 'strong' : 'review',
            state: m.matchScore >= 0.9 ? 'suggested' : 'needs_review',
            matchScore: m.matchScore.toFixed(4),
            matchMethod: m.matchMethod,
            explanation:
              m.matchScore >= 0.9
                ? 'Same amount and similar date as a BookOne entry.'
                : 'Possible match — please check.',
            reasonCodes: m.matchScore >= 0.9 ? ['amount_date'] : ['fuzzy'],
            userLabel: m.matchScore >= 0.9 ? 'Strong match' : 'Check match',
            resultLabel: m.matchScore >= 0.9 ? 'Ready to confirm' : 'Needs decision',
            sortDate: line.date,
            sortAmount: amtStr,
          })
          .returning({ id: bankReconciliationCases.id });
        await db().insert(bankReconciliationCaseBankLines).values({
          tenantId,
          caseId: c.id,
          bankLineId: line.id,
          allocatedAmount: amtStr,
        });
        await db().insert(bankReconciliationCaseBookTransactions).values({
          tenantId,
          caseId: c.id,
          transactionId: m.matchedTransactionId,
          allocatedAmount: amtStr,
        });
        lockedBankLines.add(line.id);
        createdMatch += 1;
        continue;
      }

      if (m.proposedAction === 'review' && m.candidates.length > 0) {
        const best = m.candidates[0]!;
        if (!usedBooks.has(best.id)) {
          usedBooks.add(best.id);
          const [c] = await db()
            .insert(bankReconciliationCases)
            .values({
              tenantId,
              sessionId,
              caseType: 'match_1_1',
              confidence: 'review',
              state: 'needs_review',
              matchScore: m.matchScore.toFixed(4),
              matchMethod: 'fuzzy',
              explanation: 'More than one possible BookOne entry, or the match is unclear.',
              reasonCodes: ['ambiguous'],
              userLabel: 'Needs decision',
              resultLabel: 'Review',
              sortDate: line.date,
              sortAmount: amtStr,
            })
            .returning({ id: bankReconciliationCases.id });
          await db().insert(bankReconciliationCaseBankLines).values({
            tenantId,
            caseId: c.id,
            bankLineId: line.id,
            allocatedAmount: amtStr,
          });
          await db().insert(bankReconciliationCaseBookTransactions).values({
            tenantId,
            caseId: c.id,
            transactionId: best.id,
            allocatedAmount: amtStr,
            role: 'suggested',
          });
          lockedBankLines.add(line.id);
          createdMatch += 1;
          continue;
        }
      }
    }
  } catch {
    // Matching is best-effort; still seed bank-only create_entry below
  }

  const casedBank = await db()
    .select({ bankLineId: bankReconciliationCaseBankLines.bankLineId })
    .from(bankReconciliationCaseBankLines)
    .innerJoin(
      bankReconciliationCases,
      eq(bankReconciliationCases.id, bankReconciliationCaseBankLines.caseId),
    )
    .where(
      and(
        eq(bankReconciliationCases.sessionId, sessionId),
        isNull(bankReconciliationCases.voidedAt),
        isNull(bankReconciliationCaseBankLines.voidedAt),
      ),
    );
  const casedSet = new Set(casedBank.map((x) => x.bankLineId));

  // Seed Add-to-BookOne for every uncased bank line in the work set
  for (const line of openBankLines) {
    if (casedSet.has(line.id) || lockedBankLines.has(line.id)) continue;
    const amt = Number(line.amount);
    const amtStr = Number.isFinite(amt) ? amt.toFixed(2) : '0.00';
    try {
      const [c] = await db()
        .insert(bankReconciliationCases)
        .values({
          tenantId,
          sessionId,
          caseType: 'create_entry',
          confidence: 'none',
          state: 'needs_review',
          explanation: 'No matching BookOne entry found for this bank transaction.',
          reasonCodes: ['bank_only'],
          userLabel: 'Add to BookOne',
          resultLabel: 'Add entry',
          sortDate: line.date,
          sortAmount: amtStr,
        })
        .returning({ id: bankReconciliationCases.id });
      await db().insert(bankReconciliationCaseBankLines).values({
        tenantId,
        caseId: c.id,
        bankLineId: line.id,
        allocatedAmount: amtStr,
      });
      casedSet.add(line.id);
      createdAdd += 1;
    } catch {
      // skip bad line; continue seeding others
    }
  }

  // Book-only “waiting to clear” — limited, period-bounded, not a flood of every ledger row
  const freeBookOnly = freeBooks
    .filter((b) => !usedBooks.has(b.id) && !lockedBooks.has(b.id))
    .filter((b) => b.date >= session.periodFrom && b.date <= session.periodTo)
    .sort((a, b) => Math.abs(b.amountSigned) - Math.abs(a.amountSigned))
    .slice(0, 40);
  for (const b of freeBookOnly) {
    const [c] = await db()
      .insert(bankReconciliationCases)
      .values({
        tenantId,
        sessionId,
        caseType: 'outstanding_book',
        confidence: 'review',
        state: 'needs_review',
        explanation: 'This BookOne entry is not on the bank statement yet (timing).',
        reasonCodes: ['book_only'],
        userLabel: 'Waiting to clear',
        resultLabel: 'Not on bank',
        sortDate: b.date,
        sortAmount: b.amountSigned.toFixed(2),
      })
      .returning({ id: bankReconciliationCases.id });
    await db().insert(bankReconciliationCaseBookTransactions).values({
      tenantId,
      caseId: c.id,
      transactionId: b.id,
      allocatedAmount: b.amountSigned.toFixed(2),
    });
    createdWait += 1;
  }

  // Update bank line count + book balance snapshot (count period-scoped lines)
  const bookClose = await bookBalanceThrough(tenantId, session.bankAccountId, session.periodTo);
  const periodBankCount = workLines.filter(
    (l) => !['duplicate', 'skipped'].includes(String(l.status ?? '').toLowerCase()),
  ).length;
  await db()
    .update(bankReconciliationSessions)
    .set({
      bankLineCount: periodBankCount,
      bookClosingBalanceSnapshot: bookClose.toFixed(2),
      sourceFileCount: importIds.length,
      version: sql`${bankReconciliationSessions.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(bankReconciliationSessions.id, sessionId));

  const stats: RebuildSeedStats = {
    lines: lines.length,
    workLines: workLines.length,
    openBank: openBankLines.length,
    lockedBank: lockedBankLines.size,
    freeBooks: freeBooks.length,
    createdMatch,
    createdAdd,
    createdWait,
    statusSample,
    periodFrom: session.periodFrom,
    periodTo: session.periodTo,
  };

  await refreshSessionCounts(tenantId, sessionId);
  await logEvent(tenantId, sessionId, userId, 'suggestions_rebuilt', {
    after: stats as unknown as Record<string, unknown>,
  });
  return stats;
}

export async function rebuildSessionSuggestions(
  sessionId: string,
): Promise<{ ok: true; stats?: RebuildSeedStats } | { ok: false; error: string }> {
  try {
    const id = z.string().uuid().parse(sessionId);
    const user = await requireTenantContext();
    const stats = await withTenantContext(user.tenantId, () =>
      rebuildSessionSuggestionsInternal(user.tenantId, user.id, id),
    );
    revalidateRecon();
    return { ok: true, stats };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not rebuild.' };
  }
}

export async function listReconciliationSessions(): Promise<ReconSessionListItem[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    // Ensure every committed import has a session
    const imports = await db()
      .select({ id: bankStatementImports.id })
      .from(bankStatementImports)
      .where(
        and(
          eq(bankStatementImports.tenantId, user.tenantId),
          isNull(bankStatementImports.voidedAt),
          or(
            eq(bankStatementImports.wizardStatus, 'committed'),
            inArray(bankStatementImports.status, ['committed', 'ready', 'partial', 'completed']),
          ),
        ),
      )
      .orderBy(desc(bankStatementImports.createdAt))
      .limit(30);

    for (const imp of imports) {
      const [link] = await db()
        .select({ id: bankReconciliationSessionImports.id })
        .from(bankReconciliationSessionImports)
        .where(eq(bankReconciliationSessionImports.importId, imp.id))
        .limit(1);
      if (!link) {
        try {
          await getOrCreateSessionFromImport(imp.id);
        } catch {
          /* skip broken imports */
        }
      }
    }

    const rows = await db()
      .select({
        id: bankReconciliationSessions.id,
        bankAccountId: bankReconciliationSessions.bankAccountId,
        periodFrom: bankReconciliationSessions.periodFrom,
        periodTo: bankReconciliationSessions.periodTo,
        status: bankReconciliationSessions.status,
        sourceFileCount: bankReconciliationSessions.sourceFileCount,
        bankLineCount: bankReconciliationSessions.bankLineCount,
        resolvedCaseCount: bankReconciliationSessions.resolvedCaseCount,
        openCaseCount: bankReconciliationSessions.openCaseCount,
        differenceAmount: bankReconciliationSessions.differenceAmount,
        updatedAt: bankReconciliationSessions.updatedAt,
      })
      .from(bankReconciliationSessions)
      .where(
        and(
          eq(bankReconciliationSessions.tenantId, user.tenantId),
          isNull(bankReconciliationSessions.voidedAt),
        ),
      )
      .orderBy(desc(bankReconciliationSessions.updatedAt))
      .limit(40);

    const bankIds = [...new Set(rows.map((r) => r.bankAccountId))];
    const bankMap = new Map<string, { name: string; code: string }>();
    if (bankIds.length) {
      const banks = await db()
        .select({ id: accounts.id, name: accounts.name, code: accounts.code })
        .from(accounts)
        .where(and(eq(accounts.tenantId, user.tenantId), inArray(accounts.id, bankIds)));
      for (const b of banks) bankMap.set(b.id, { name: b.name, code: b.code });
    }

    return rows.map((r) => {
      const bank = bankMap.get(r.bankAccountId);
      const total = Math.max(r.bankLineCount || r.resolvedCaseCount + r.openCaseCount, 1);
      const resolved = r.resolvedCaseCount;
      return {
        id: r.id,
        bankAccountId: r.bankAccountId,
        bankName: bank?.name ?? 'Bank',
        bankCode: bank?.code ?? '',
        periodFrom: r.periodFrom,
        periodTo: r.periodTo,
        periodLabel: formatPeriodLabel(r.periodFrom, r.periodTo),
        status: r.status,
        statusLabel: statusLabel(r.status),
        sourceFileCount: r.sourceFileCount,
        bankLineCount: r.bankLineCount,
        resolvedCaseCount: r.resolvedCaseCount,
        openCaseCount: r.openCaseCount,
        differenceAmount: Number(r.differenceAmount),
        progressPct: Math.min(100, Math.round((resolved / total) * 100)),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  });
}

export async function openReconciliationSession(
  sessionId: string,
  opts?: { tab?: string; page?: number; pageSize?: number; q?: string },
): Promise<{ ok: true; detail: ReconSessionDetail } | { ok: false; error: string }> {
  try {
    const id = z.string().uuid().parse(sessionId);
    const user = await requireTenantContext();
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(50, Math.max(10, opts?.pageSize ?? 20));
    let tab = opts?.tab ?? 'auto';
    const q = (opts?.q ?? '').trim().toLowerCase();

    const detail = await withTenantContext(user.tenantId, async () => {
      let [session] = await db()
        .select()
        .from(bankReconciliationSessions)
        .where(
          and(
            eq(bankReconciliationSessions.id, id),
            eq(bankReconciliationSessions.tenantId, user.tenantId),
            isNull(bankReconciliationSessions.voidedAt),
          ),
        )
        .limit(1);
      if (!session) throw new Error('Session not found.');

      // Seed if empty, or reseed when bank lines exist but no bank-side cases (book-only flood bug)
      const [{ totalC }] = await db()
        .select({ totalC: sql<number>`count(*)::int` })
        .from(bankReconciliationCases)
        .where(
          and(
            eq(bankReconciliationCases.sessionId, id),
            isNull(bankReconciliationCases.voidedAt),
          ),
        );
      const [{ bankC }] = await db()
        .select({ bankC: sql<number>`count(*)::int` })
        .from(bankReconciliationCases)
        .where(
          and(
            eq(bankReconciliationCases.sessionId, id),
            isNull(bankReconciliationCases.voidedAt),
            inArray(bankReconciliationCases.caseType, [
              'match_1_1',
              'create_entry',
              'duplicate',
            ]),
          ),
        );
      // Reseed when empty, multi-year period noise, or bank lines far outnumber bank-side cases
      // (legacy bug: only a few confirmed matches + book-only flood, zero create_entry)
      const multiYear =
        session.periodFrom.slice(0, 7) !== session.periodTo.slice(0, 7) &&
        (Number(session.periodTo.slice(0, 4)) - Number(session.periodFrom.slice(0, 4))) * 12 +
          (Number(session.periodTo.slice(5, 7)) - Number(session.periodFrom.slice(5, 7))) >
          2;
      // Live import lines vs period-scoped coverage (detect thin wrong period / missing bank cases)
      const importLinks = await db()
        .select({ importId: bankReconciliationSessionImports.importId })
        .from(bankReconciliationSessionImports)
        .where(eq(bankReconciliationSessionImports.sessionId, id));
      let liveLineCount = 0;
      let inPeriodLineCount = 0;
      if (importLinks.length > 0) {
        const ids = importLinks.map((l) => l.importId);
        const [{ n }] = await db()
          .select({ n: sql<number>`count(*)::int` })
          .from(bankStatementLines)
          .where(
            and(
              eq(bankStatementLines.tenantId, user.tenantId),
              isNull(bankStatementLines.voidedAt),
              inArray(bankStatementLines.importId, ids),
              sql`coalesce(${bankStatementLines.status}, '') not in ('duplicate', 'skipped')`,
            ),
          );
        liveLineCount = Number(n) || 0;
        const [{ p }] = await db()
          .select({ p: sql<number>`count(*)::int` })
          .from(bankStatementLines)
          .where(
            and(
              eq(bankStatementLines.tenantId, user.tenantId),
              isNull(bankStatementLines.voidedAt),
              inArray(bankStatementLines.importId, ids),
              sql`coalesce(${bankStatementLines.status}, '') not in ('duplicate', 'skipped')`,
              gte(bankStatementLines.transactionDate, session.periodFrom),
              lte(bankStatementLines.transactionDate, session.periodTo),
            ),
          );
        inPeriodLineCount = Number(p) || 0;
      }
      const periodTooThin =
        liveLineCount > 20 &&
        inPeriodLineCount < Math.max(5, Math.floor(liveLineCount * 0.15));
      const bankCasesLag =
        inPeriodLineCount > 10 &&
        Number(bankC) < Math.floor(inPeriodLineCount * 0.5);
      const needsRebuild =
        Number(totalC) === 0 ||
        multiYear ||
        periodTooThin ||
        bankCasesLag ||
        (session.bankLineCount > 0 && Number(bankC) === 0) ||
        (session.bankLineCount > 20 && Number(bankC) < Math.floor(session.bankLineCount * 0.5));
      if (needsRebuild) {
        await rebuildSessionSuggestionsInternal(user.tenantId, user.id, id);
        [session] = await db()
          .select()
          .from(bankReconciliationSessions)
          .where(eq(bankReconciliationSessions.id, id))
          .limit(1);
        if (!session) throw new Error('Session not found.');
      }

      const [bank] = await db()
        .select({ name: accounts.name, code: accounts.code })
        .from(accounts)
        .where(eq(accounts.id, session.bankAccountId))
        .limit(1);

      const sourceFiles = await db()
        .select({
          importId: bankReconciliationSessionImports.importId,
          fileName: bankStatementImports.fileName,
        })
        .from(bankReconciliationSessionImports)
        .innerJoin(
          bankStatementImports,
          eq(bankStatementImports.id, bankReconciliationSessionImports.importId),
        )
        .where(eq(bankReconciliationSessionImports.sessionId, id));

      const allCasesRaw = await db()
        .select()
        .from(bankReconciliationCases)
        .where(
          and(
            eq(bankReconciliationCases.sessionId, id),
            isNull(bankReconciliationCases.voidedAt),
          ),
        )
        .orderBy(desc(bankReconciliationCases.sortDate));

      // Bank-side work first in "All" (match/add before book-only waiting)
      const typeRank = (t: string) => {
        if (t === 'match_1_1') return 0;
        if (t === 'create_entry') return 1;
        if (t === 'duplicate') return 2;
        if (t === 'outstanding_book') return 3;
        return 4;
      };
      const allCases = [...allCasesRaw].sort((a, b) => {
        const ra = typeRank(a.caseType);
        const rb = typeRank(b.caseType);
        if (ra !== rb) return ra - rb;
        return (b.sortDate ?? '').localeCompare(a.sortDate ?? '');
      });

      const tabCounts: Record<string, number> = {
        all: allCases.length,
        ready: 0,
        decision: 0,
        add: 0,
        waiting: 0,
        duplicates: 0,
        completed: 0,
      };
      for (const c of allCases) {
        if (c.state === 'confirmed' || c.state === 'excluded') tabCounts.completed! += 1;
        else if (c.caseType === 'duplicate') tabCounts.duplicates! += 1;
        else if (c.caseType === 'outstanding_book') tabCounts.waiting! += 1;
        else if (c.caseType === 'create_entry') tabCounts.add! += 1;
        else if (c.state === 'suggested' && c.confidence === 'strong') tabCounts.ready! += 1;
        else if (c.caseType === 'match_1_1') tabCounts.decision! += 1;
        else tabCounts.decision! += 1;
      }

      // Spec default tab: decision → add → ready → waiting → all
      if (tab === 'auto') {
        if ((tabCounts.decision ?? 0) > 0) tab = 'decision';
        else if ((tabCounts.add ?? 0) > 0) tab = 'add';
        else if ((tabCounts.ready ?? 0) > 0) tab = 'ready';
        else if ((tabCounts.waiting ?? 0) > 0) tab = 'waiting';
        else tab = 'all';
      }

      let filtered = allCases;
      if (tab === 'ready')
        filtered = allCases.filter(
          (c) =>
            c.state === 'suggested' &&
            c.confidence === 'strong' &&
            c.caseType === 'match_1_1',
        );
      else if (tab === 'decision')
        filtered = allCases.filter(
          (c) =>
            c.caseType === 'match_1_1' &&
            c.state !== 'confirmed' &&
            !(c.state === 'suggested' && c.confidence === 'strong'),
        );
      else if (tab === 'add')
        filtered = allCases.filter(
          (c) => c.caseType === 'create_entry' && c.state !== 'confirmed',
        );
      else if (tab === 'waiting')
        filtered = allCases.filter(
          (c) => c.caseType === 'outstanding_book' && c.state !== 'confirmed',
        );
      else if (tab === 'duplicates')
        filtered = allCases.filter((c) => c.caseType === 'duplicate' || c.state === 'excluded');
      else if (tab === 'completed')
        filtered = allCases.filter((c) => c.state === 'confirmed' || c.state === 'excluded');

      if (q) {
        filtered = filtered.filter(
          (c) =>
            (c.explanation ?? '').toLowerCase().includes(q) ||
            (c.userLabel ?? '').toLowerCase().includes(q) ||
            (c.resultLabel ?? '').toLowerCase().includes(q),
        );
      }

      const totalCases = filtered.length;
      const slice = filtered.slice((page - 1) * pageSize, page * pageSize);

      // Hydrate bank + book sides
      const caseIds = slice.map((c) => c.id);
      const bankJoins =
        caseIds.length === 0
          ? []
          : await db()
              .select({
                caseId: bankReconciliationCaseBankLines.caseId,
                bankLineId: bankReconciliationCaseBankLines.bankLineId,
                date: bankStatementLines.transactionDate,
                description: bankStatementLines.description,
                amount: bankStatementLines.amount,
              })
              .from(bankReconciliationCaseBankLines)
              .innerJoin(
                bankStatementLines,
                eq(bankStatementLines.id, bankReconciliationCaseBankLines.bankLineId),
              )
              .where(
                and(
                  inArray(bankReconciliationCaseBankLines.caseId, caseIds),
                  isNull(bankReconciliationCaseBankLines.voidedAt),
                ),
              );

      const bookJoins =
        caseIds.length === 0
          ? []
          : await db()
              .select({
                caseId: bankReconciliationCaseBookTransactions.caseId,
                transactionId: bankReconciliationCaseBookTransactions.transactionId,
                role: bankReconciliationCaseBookTransactions.role,
                date: transactions.date,
                description: transactions.description,
                amount: transactions.amount,
                direction: transactions.direction,
                paymentAccountId: transactions.paymentAccountId,
                transferSourceAccountId: transactions.transferSourceAccountId,
              })
              .from(bankReconciliationCaseBookTransactions)
              .innerJoin(
                transactions,
                eq(transactions.id, bankReconciliationCaseBookTransactions.transactionId),
              )
              .where(
                and(
                  inArray(bankReconciliationCaseBookTransactions.caseId, caseIds),
                  isNull(bankReconciliationCaseBookTransactions.voidedAt),
                ),
              );

      const bankByCase = new Map<string, (typeof bankJoins)[0]>();
      for (const b of bankJoins) bankByCase.set(b.caseId, b);
      const bookByCase = new Map<string, (typeof bookJoins)[0]>();
      for (const b of bookJoins) {
        if (!bookByCase.has(b.caseId) || b.role === 'primary') bookByCase.set(b.caseId, b);
      }

      const cases: ReconCaseRow[] = slice.map((c) => {
        const bank = bankByCase.get(c.id);
        const book = bookByCase.get(c.id);
        let bookAmt: number | null = null;
        if (book) {
          bookAmt = bookSignedAmount(
            book.direction,
            Number(book.amount),
            book.paymentAccountId,
            book.transferSourceAccountId,
            session.bankAccountId,
          );
        }
        let connection: ReconCaseRow['connection'] = 'match';
        if (c.caseType === 'create_entry' || c.caseType === 'duplicate') connection = 'bank_only';
        if (c.caseType === 'outstanding_book') connection = 'book_only';
        if (bank && book) connection = 'match';

        return {
          id: c.id,
          caseType: c.caseType,
          confidence: c.confidence,
          state: c.state,
          matchScore: c.matchScore != null ? Number(c.matchScore) : null,
          matchMethod: c.matchMethod,
          explanation: c.explanation,
          reasonCodes: (c.reasonCodes as string[]) ?? [],
          userLabel: c.userLabel,
          resultLabel: c.resultLabel,
          sortDate: c.sortDate,
          sortAmount: c.sortAmount != null ? Number(c.sortAmount) : null,
          connection,
          bank: {
            lineId: bank?.bankLineId ?? null,
            date: bank?.date ?? null,
            description: bank?.description ?? null,
            amount: bank ? Number(bank.amount) : null,
          },
          book: {
            transactionId: book?.transactionId ?? null,
            date: book?.date ?? null,
            description: book?.description ?? null,
            amount: bookAmt,
          },
          candidates: [],
        };
      });

      const total = Math.max(session.bankLineCount || allCases.length, 1);
      const listItem: ReconSessionDetail['session'] = {
        id: session.id,
        bankAccountId: session.bankAccountId,
        bankName: bank?.name ?? 'Bank',
        bankCode: bank?.code ?? '',
        periodFrom: session.periodFrom,
        periodTo: session.periodTo,
        periodLabel: formatPeriodLabel(session.periodFrom, session.periodTo),
        status: session.status,
        statusLabel: statusLabel(session.status),
        sourceFileCount: session.sourceFileCount,
        bankLineCount: session.bankLineCount,
        resolvedCaseCount: session.resolvedCaseCount,
        openCaseCount: session.openCaseCount,
        differenceAmount: Number(session.differenceAmount),
        progressPct: Math.min(
          100,
          Math.round((session.resolvedCaseCount / total) * 100),
        ),
        updatedAt: session.updatedAt.toISOString(),
        version: session.version,
        statementClosingBalance:
          session.statementClosingBalance != null
            ? Number(session.statementClosingBalance)
            : null,
        bookClosingBalance:
          session.bookClosingBalanceSnapshot != null
            ? Number(session.bookClosingBalanceSnapshot)
            : null,
        outstandingNet: Number(session.outstandingNet),
        sourceFiles,
      };

      return {
        session: listItem,
        activeTab: tab,
        tabCounts,
        cases,
        page,
        pageSize,
        totalCases,
      } satisfies ReconSessionDetail;
    });

    return { ok: true, detail };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not open session.' };
  }
}

export async function confirmCaseMatch(input: {
  caseId: string;
  expectedVersion?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const caseId = z.string().uuid().parse(input.caseId);
    const user = await requireTenantContext();

    await withTenantContext(user.tenantId, async () => {
      const [c] = await db()
        .select()
        .from(bankReconciliationCases)
        .where(
          and(
            eq(bankReconciliationCases.id, caseId),
            eq(bankReconciliationCases.tenantId, user.tenantId),
            isNull(bankReconciliationCases.voidedAt),
          ),
        )
        .limit(1);
      if (!c) throw new Error('Case not found.');
      if (c.state === 'confirmed') return;
      if (c.caseType !== 'match_1_1') throw new Error('This case is not a match.');

      const [book] = await db()
        .select({
          transactionId: bankReconciliationCaseBookTransactions.transactionId,
        })
        .from(bankReconciliationCaseBookTransactions)
        .where(
          and(
            eq(bankReconciliationCaseBookTransactions.caseId, caseId),
            isNull(bankReconciliationCaseBookTransactions.voidedAt),
          ),
        )
        .limit(1);
      if (!book) throw new Error('No BookOne entry on this case.');

      const [bank] = await db()
        .select({ bankLineId: bankReconciliationCaseBankLines.bankLineId })
        .from(bankReconciliationCaseBankLines)
        .where(
          and(
            eq(bankReconciliationCaseBankLines.caseId, caseId),
            isNull(bankReconciliationCaseBankLines.voidedAt),
          ),
        )
        .limit(1);
      if (!bank) throw new Error('No bank line on this case.');

      await db()
        .update(bankReconciliationCases)
        .set({
          state: 'confirmed',
          resultLabel: 'Confirmed',
          confirmedBy: user.id,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationCases.id, caseId));

      await db()
        .update(bankStatementLines)
        .set({
          status: 'reconciled',
          matchedTransactionId: book.transactionId,
          proposedAction: 'link',
          matchMethod: 'manual',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankStatementLines.id, bank.bankLineId));

      await logEvent(user.tenantId, c.sessionId, user.id, 'match_confirmed', {
        caseId,
        after: { transactionId: book.transactionId, bankLineId: bank.bankLineId },
      });
      await refreshSessionCounts(user.tenantId, c.sessionId);
    });

    revalidateRecon();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not confirm match.' };
  }
}

export async function bulkConfirmStrongMatches(
  sessionId: string,
): Promise<{ ok: true; confirmed: number } | { ok: false; error: string }> {
  try {
    const id = z.string().uuid().parse(sessionId);
    const user = await requireTenantContext();
    let confirmed = 0;

    await withTenantContext(user.tenantId, async () => {
      const strong = await db()
        .select({ id: bankReconciliationCases.id })
        .from(bankReconciliationCases)
        .where(
          and(
            eq(bankReconciliationCases.sessionId, id),
            eq(bankReconciliationCases.tenantId, user.tenantId),
            isNull(bankReconciliationCases.voidedAt),
            eq(bankReconciliationCases.caseType, 'match_1_1'),
            eq(bankReconciliationCases.confidence, 'strong'),
            eq(bankReconciliationCases.state, 'suggested'),
          ),
        );
      for (const c of strong) {
        const res = await confirmCaseMatch({ caseId: c.id });
        if (res.ok) confirmed += 1;
      }
    });

    revalidateRecon();
    return { ok: true, confirmed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Bulk confirm failed.' };
  }
}

export async function undoCaseMatch(input: {
  caseId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const caseId = z.string().uuid().parse(input.caseId);
    const user = await requireTenantContext();

    await withTenantContext(user.tenantId, async () => {
      const [c] = await db()
        .select()
        .from(bankReconciliationCases)
        .where(
          and(
            eq(bankReconciliationCases.id, caseId),
            eq(bankReconciliationCases.tenantId, user.tenantId),
            isNull(bankReconciliationCases.voidedAt),
          ),
        )
        .limit(1);
      if (!c) throw new Error('Case not found.');
      if (c.state !== 'confirmed' || c.caseType !== 'match_1_1') {
        throw new Error('Only confirmed matches can be unlinked this way.');
      }

      const [bank] = await db()
        .select({ bankLineId: bankReconciliationCaseBankLines.bankLineId })
        .from(bankReconciliationCaseBankLines)
        .where(
          and(
            eq(bankReconciliationCaseBankLines.caseId, caseId),
            isNull(bankReconciliationCaseBankLines.voidedAt),
          ),
        )
        .limit(1);

      await db()
        .update(bankReconciliationCases)
        .set({
          state: 'reopened',
          resultLabel: 'Reopened',
          confirmedBy: null,
          confirmedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationCases.id, caseId));

      if (bank) {
        await db()
          .update(bankStatementLines)
          .set({
            status: 'imported',
            matchedTransactionId: null,
            proposedAction: 'review',
            updatedAt: new Date(),
          })
          .where(eq(bankStatementLines.id, bank.bankLineId));
      }

      await logEvent(user.tenantId, c.sessionId, user.id, 'match_undone', { caseId });
      await refreshSessionCounts(user.tenantId, c.sessionId);
    });

    revalidateRecon();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not undo.' };
  }
}

export async function markCaseOutstanding(input: {
  caseId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const caseId = z.string().uuid().parse(input.caseId);
    const user = await requireTenantContext();
    await withTenantContext(user.tenantId, async () => {
      const [c] = await db()
        .select()
        .from(bankReconciliationCases)
        .where(
          and(
            eq(bankReconciliationCases.id, caseId),
            eq(bankReconciliationCases.tenantId, user.tenantId),
            isNull(bankReconciliationCases.voidedAt),
          ),
        )
        .limit(1);
      if (!c) throw new Error('Case not found.');
      if (c.caseType !== 'outstanding_book') throw new Error('Not a waiting item.');

      const [book] = await db()
        .select({ transactionId: bankReconciliationCaseBookTransactions.transactionId })
        .from(bankReconciliationCaseBookTransactions)
        .where(eq(bankReconciliationCaseBookTransactions.caseId, caseId))
        .limit(1);

      await db()
        .update(bankReconciliationCases)
        .set({
          state: 'confirmed',
          resultLabel: 'Waiting to clear',
          confirmedBy: user.id,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationCases.id, caseId));

      if (book) {
        await db().insert(bankReconciliationOutstandingItems).values({
          tenantId: user.tenantId,
          sessionId: c.sessionId,
          transactionId: book.transactionId,
          caseId,
          reason: input.reason ?? 'not_cleared',
          createdBy: user.id,
        });
      }
      await logEvent(user.tenantId, c.sessionId, user.id, 'outstanding_confirmed', { caseId });
      await refreshSessionCounts(user.tenantId, c.sessionId);
    });
    revalidateRecon();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not mark outstanding.' };
  }
}

/**
 * Phase 4: Create a BookOne entry for a bank-only case (explicit confirm).
 * Uses the same recordEntry path as BIS-6.
 */
export async function createCaseEntry(input: {
  caseId: string;
  expenseCode?: string;
  incomeCode?: string;
}): Promise<{ ok: true; transactionId: string } | { ok: false; error: string }> {
  try {
    const caseId = z.string().uuid().parse(input.caseId);
    const expenseCode = (input.expenseCode ?? '6000').slice(0, 20);
    const incomeCode = (input.incomeCode ?? '4000').slice(0, 20);
    const user = await requireTenantContext();

    const prepared = await withTenantContext(user.tenantId, async () => {
      const [c] = await db()
        .select()
        .from(bankReconciliationCases)
        .where(
          and(
            eq(bankReconciliationCases.id, caseId),
            eq(bankReconciliationCases.tenantId, user.tenantId),
            isNull(bankReconciliationCases.voidedAt),
          ),
        )
        .limit(1);
      if (!c) throw new Error('Case not found.');
      if (c.caseType !== 'create_entry') throw new Error('This item is not an Add-to-BookOne case.');
      if (c.state === 'confirmed') throw new Error('Already added.');

      const [session] = await db()
        .select()
        .from(bankReconciliationSessions)
        .where(eq(bankReconciliationSessions.id, c.sessionId))
        .limit(1);
      if (!session) throw new Error('Session not found.');

      const [bankJoin] = await db()
        .select({
          bankLineId: bankReconciliationCaseBankLines.bankLineId,
          date: bankStatementLines.transactionDate,
          description: bankStatementLines.description,
          amount: bankStatementLines.amount,
          fingerprint: bankStatementLines.fingerprint,
        })
        .from(bankReconciliationCaseBankLines)
        .innerJoin(
          bankStatementLines,
          eq(bankStatementLines.id, bankReconciliationCaseBankLines.bankLineId),
        )
        .where(
          and(
            eq(bankReconciliationCaseBankLines.caseId, caseId),
            isNull(bankReconciliationCaseBankLines.voidedAt),
          ),
        )
        .limit(1);
      if (!bankJoin) throw new Error('No bank transaction on this case.');

      const [bank] = await db()
        .select({ id: accounts.id, code: accounts.code })
        .from(accounts)
        .where(eq(accounts.id, session.bankAccountId))
        .limit(1);
      if (!bank) throw new Error('Bank account not found.');

      return {
        caseRow: c,
        session,
        bankJoin,
        bankCode: bank.code,
        bookDomain: session.bookDomain,
      };
    });

    const signed = Number(prepared.bankJoin.amount);
    const abs = Math.abs(signed);
    if (abs < 0.005) throw new Error('Zero amount cannot be posted.');

    const isIn = signed > 0;
    const desc = (prepared.bankJoin.description || 'Bank statement').slice(0, 1000);
    const party = isIn ? 'Bank deposit' : 'Bank payment';
    const catCode = isIn ? incomeCode : expenseCode;
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

    const { recordEntry } = await import('@/app/actions/record-entry');
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
          date: prepared.bankJoin.date,
          bookDomain,
          categoryOverride: catCode,
          forceDuplicate: true,
          receiptRef: `recon:${prepared.bankJoin.fingerprint?.slice(0, 16) ?? prepared.bankJoin.bankLineId.slice(0, 8)}`,
        })
      : await recordEntry({
          direction: 'money_out',
          party,
          description: desc,
          amount: abs,
          currency: 'LKR',
          paymentMethod: payMethod as 'Cash' | 'Bank' | 'Card',
          paymentAccount: { kind: 'code', value: prepared.bankCode },
          date: prepared.bankJoin.date,
          bookDomain,
          categoryOverride: catCode,
          forceDuplicate: true,
          receiptRef: `recon:${prepared.bankJoin.fingerprint?.slice(0, 16) ?? prepared.bankJoin.bankLineId.slice(0, 8)}`,
        });

    if (!entryResult.success || !entryResult.transactionId) {
      return { ok: false, error: entryResult.error ?? 'Could not create BookOne entry.' };
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
        .where(eq(bankStatementLines.id, prepared.bankJoin.bankLineId));

      // Attach book side to case
      await db().insert(bankReconciliationCaseBookTransactions).values({
        tenantId: user.tenantId,
        caseId,
        transactionId: entryResult.transactionId!,
        allocatedAmount: prepared.bankJoin.amount,
        role: 'primary',
      });

      await db()
        .update(bankReconciliationCases)
        .set({
          state: 'confirmed',
          resultLabel: 'Added to BookOne',
          userLabel: 'Added',
          createdTransactionId: entryResult.transactionId,
          confirmedBy: user.id,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationCases.id, caseId));

      await logEvent(user.tenantId, prepared.caseRow.sessionId, user.id, 'entry_created', {
        caseId,
        after: {
          transactionId: entryResult.transactionId,
          bankLineId: prepared.bankJoin.bankLineId,
          category: catCode,
        },
      });
      await refreshSessionCounts(user.tenantId, prepared.caseRow.sessionId);
    });

    revalidateRecon();
    return { ok: true, transactionId: entryResult.transactionId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create entry.' };
  }
}

/**
 * Phase 5: Finish reconciliation when difference is explained (≈0) and no open work remains.
 */
export async function finishReconciliationSession(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const id = z.string().uuid().parse(sessionId);
    const user = await requireTenantContext();

    await withTenantContext(user.tenantId, async () => {
      const [session] = await db()
        .select()
        .from(bankReconciliationSessions)
        .where(
          and(
            eq(bankReconciliationSessions.id, id),
            eq(bankReconciliationSessions.tenantId, user.tenantId),
            isNull(bankReconciliationSessions.voidedAt),
          ),
        )
        .limit(1);
      if (!session) throw new Error('Session not found.');

      const openCases = await db()
        .select({ id: bankReconciliationCases.id, caseType: bankReconciliationCases.caseType })
        .from(bankReconciliationCases)
        .where(
          and(
            eq(bankReconciliationCases.sessionId, id),
            isNull(bankReconciliationCases.voidedAt),
            inArray(bankReconciliationCases.state, [
              'suggested',
              'needs_review',
              'deferred',
              'reopened',
            ]),
          ),
        );

      // Allow outstanding_book to remain only if already confirmed as waiting
      const blocking = openCases.filter((c) => c.caseType !== 'outstanding_book');
      // Any open non-waiting work blocks finish
      if (blocking.length > 0) {
        throw new Error(
          `${blocking.length} item${blocking.length === 1 ? '' : 's'} still need a decision. Finish those first.`,
        );
      }
      // Open waiting items must be marked Still waiting first
      const openWait = openCases.filter((c) => c.caseType === 'outstanding_book');
      if (openWait.length > 0) {
        throw new Error(
          `${openWait.length} waiting item${openWait.length === 1 ? '' : 's'} still open — mark them as still waiting, or match them.`,
        );
      }

      const bankClose =
        session.statementClosingBalance != null
          ? Number(session.statementClosingBalance)
          : null;
      const bookClose =
        session.bookClosingBalanceSnapshot != null
          ? Number(session.bookClosingBalanceSnapshot)
          : null;
      const outstandingNet = Number(session.outstandingNet);
      const diff =
        bankClose != null && bookClose != null
          ? Math.round((bankClose - bookClose - outstandingNet) * 100) / 100
          : Number(session.differenceAmount);
      const tol = Number(session.toleranceAmount ?? 0.01);
      if (Math.abs(diff) > tol) {
        throw new Error(
          `Difference left is Rs. ${diff.toFixed(2)}. It must be near zero (within ${tol}) before finish.`,
        );
      }

      await db()
        .update(bankReconciliationSessions)
        .set({
          status: 'reconciled',
          differenceAmount: diff.toFixed(2),
          reconciledBy: user.id,
          reconciledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationSessions.id, id));

      await logEvent(user.tenantId, id, user.id, 'session_reconciled', {
        after: { difference: diff, bankClose, bookClose, outstandingNet },
      });
    });

    revalidateRecon();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not finish reconciliation.' };
  }
}

/** Compat: import id → session id (for redirects). */
export async function resolveImportToSession(
  importId: string,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  return getOrCreateSessionFromImport(importId);
}
