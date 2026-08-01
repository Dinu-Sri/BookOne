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
  bankReconciliationSnapshots,
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
  | 'excluded'
  | 'transfer'
  | 'group_match';

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
  /** Phase 7 final-review summary */
  review?: ReconReviewSummary;
};

export type ReconReviewSummary = {
  bankLines: number;
  matched: number;
  added: number;
  transfers: number;
  waiting: number;
  duplicates: number;
  groups: number;
  needsAttention: number;
  bankClosing: number | null;
  bookClosing: number | null;
  outstandingNet: number;
  difference: number;
  canFinish: boolean;
  finishBlockers: string[];
  status: string;
};

/** Detect likely inter-account transfer narratives (suggest only). */
function looksLikeTransfer(description: string | null | undefined): boolean {
  const d = (description ?? '').toLowerCase();
  return /\b(ceft|slips|ift|fund\s*transfer|trf\b|transfer\s+to|transfer\s+from|own\s*a\/?c|internal\s+transfer|sweep)\b/i.test(
    d,
  );
}

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
    case 'reopened':
      return 'Reopened';
    case 'ready_to_finish':
      return 'Ready to finish';
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
    // Only filter domain when both sides are set and disagree (null = any domain)
    if (
      bookDomain &&
      r.bookDomain &&
      bookDomain !== r.bookDomain &&
      bookDomain !== 'all'
    ) {
      continue;
    }
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
        try {
          await rebuildSessionSuggestionsInternal(user.tenantId, user.id, existingLink.sessionId);
        } catch {
          /* non-fatal — user can Refresh on workbench */
        }
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

      try {
        await rebuildSessionSuggestionsInternal(user.tenantId, user.id, session.id);
      } catch {
        /* Session is still usable; suggestions can rebuild via Refresh */
      }
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

  // Seed Add-to-BookOne (or possible transfer) for every uncased bank line
  for (const line of openBankLines) {
    if (casedSet.has(line.id) || lockedBankLines.has(line.id)) continue;
    const amt = Number(line.amount);
    const amtStr = Number.isFinite(amt) ? amt.toFixed(2) : '0.00';
    const asTransfer = looksLikeTransfer(line.description);
    try {
      const [c] = await db()
        .insert(bankReconciliationCases)
        .values({
          tenantId,
          sessionId,
          caseType: asTransfer ? 'transfer' : 'create_entry',
          confidence: asTransfer ? 'review' : 'none',
          state: 'needs_review',
          explanation: asTransfer
            ? 'This may be a transfer between your accounts (not income or expense). Confirm or treat as normal entry.'
            : 'No matching BookOne entry found for this bank transaction.',
          reasonCodes: asTransfer ? ['possible_transfer'] : ['bank_only'],
          userLabel: asTransfer ? 'Possible transfer' : 'Add to BookOne',
          resultLabel: asTransfer ? 'Transfer?' : 'Add entry',
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
              'transfer',
              'group_match',
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

      // Bank-side work first in "All" (match/transfer/add before book-only waiting)
      const typeRank = (t: string) => {
        if (t === 'match_1_1') return 0;
        if (t === 'transfer') return 1;
        if (t === 'group_match') return 2;
        if (t === 'create_entry') return 3;
        if (t === 'duplicate') return 4;
        if (t === 'outstanding_book') return 5;
        return 6;
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
        transfers: 0,
        waiting: 0,
        duplicates: 0,
        completed: 0,
      };
      for (const c of allCases) {
        if (c.state === 'confirmed' || c.state === 'excluded') tabCounts.completed! += 1;
        else if (c.caseType === 'duplicate') tabCounts.duplicates! += 1;
        else if (c.caseType === 'outstanding_book') tabCounts.waiting! += 1;
        else if (c.caseType === 'transfer') tabCounts.transfers! += 1;
        else if (c.caseType === 'create_entry' || c.caseType === 'group_match') tabCounts.add! += 1;
        else if (c.state === 'suggested' && c.confidence === 'strong') tabCounts.ready! += 1;
        else if (c.caseType === 'match_1_1') tabCounts.decision! += 1;
        else tabCounts.decision! += 1;
      }

      // Spec default tab: decision → transfers → add → ready → waiting → all
      if (tab === 'auto') {
        if ((tabCounts.decision ?? 0) > 0) tab = 'decision';
        else if ((tabCounts.transfers ?? 0) > 0) tab = 'transfers';
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
            (c.caseType === 'match_1_1' || c.caseType === 'group_match') &&
            c.state !== 'confirmed' &&
            !(c.state === 'suggested' && c.confidence === 'strong' && c.caseType === 'match_1_1'),
        );
      else if (tab === 'transfers')
        filtered = allCases.filter(
          (c) => c.caseType === 'transfer' && c.state !== 'confirmed' && c.state !== 'excluded',
        );
      else if (tab === 'add')
        filtered = allCases.filter(
          (c) =>
            (c.caseType === 'create_entry' || c.caseType === 'group_match') &&
            c.state !== 'confirmed',
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
        if (
          c.caseType === 'create_entry' ||
          c.caseType === 'duplicate' ||
          c.caseType === 'transfer'
        )
          connection = 'bank_only';
        if (c.caseType === 'outstanding_book') connection = 'book_only';
        if (bank && book) connection = 'match';
        if (c.caseType === 'group_match' && bank) connection = book ? 'match' : 'bank_only';

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

      const revBankClose = listItem.statementClosingBalance;
      const revBookClose = listItem.bookClosingBalance;
      const revOutstanding = listItem.outstandingNet;
      const revDiff =
        revBankClose != null && revBookClose != null
          ? Math.round((revBankClose - revBookClose - revOutstanding) * 100) / 100
          : listItem.differenceAmount;
      const finishBlockers: string[] = [];
      if ((tabCounts.decision ?? 0) > 0)
        finishBlockers.push(`${tabCounts.decision} need decision`);
      if ((tabCounts.transfers ?? 0) > 0)
        finishBlockers.push(
          `${tabCounts.transfers} possible transfer${(tabCounts.transfers ?? 0) === 1 ? '' : 's'}`,
        );
      if ((tabCounts.add ?? 0) > 0) finishBlockers.push(`${tabCounts.add} to add`);
      if ((tabCounts.waiting ?? 0) > 0)
        finishBlockers.push(`${tabCounts.waiting} waiting (mark still waiting)`);
      if ((tabCounts.ready ?? 0) > 0)
        finishBlockers.push(`${tabCounts.ready} ready to confirm`);
      const tol = Number(session.toleranceAmount ?? 0.01);
      if (Math.abs(revDiff) > tol)
        finishBlockers.push(`Difference Rs. ${revDiff.toFixed(2)}`);

      const review: ReconReviewSummary = {
        bankLines: session.bankLineCount,
        matched: allCases.filter(
          (c) => c.caseType === 'match_1_1' && c.state === 'confirmed',
        ).length,
        added: allCases.filter(
          (c) =>
            (c.caseType === 'create_entry' || c.caseType === 'group_match') &&
            c.state === 'confirmed',
        ).length,
        transfers: allCases.filter(
          (c) => c.caseType === 'transfer' && c.state === 'confirmed',
        ).length,
        waiting: allCases.filter(
          (c) => c.caseType === 'outstanding_book' && c.state === 'confirmed',
        ).length,
        duplicates: allCases.filter(
          (c) => c.caseType === 'duplicate' || c.state === 'excluded',
        ).length,
        groups: allCases.filter((c) => c.caseType === 'group_match').length,
        needsAttention:
          (tabCounts.decision ?? 0) +
          (tabCounts.add ?? 0) +
          (tabCounts.transfers ?? 0) +
          (tabCounts.waiting ?? 0) +
          (tabCounts.ready ?? 0),
        bankClosing: revBankClose,
        bookClosing: revBookClose,
        outstandingNet: revOutstanding,
        difference: revDiff,
        canFinish: finishBlockers.length === 0 && session.status !== 'reconciled',
        finishBlockers,
        status: session.status,
      };

      return {
        session: listItem,
        activeTab: tab,
        tabCounts,
        cases,
        page,
        pageSize,
        totalCases,
        review,
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

      const cases = await db()
        .select({
          caseType: bankReconciliationCases.caseType,
          state: bankReconciliationCases.state,
        })
        .from(bankReconciliationCases)
        .where(
          and(
            eq(bankReconciliationCases.sessionId, id),
            isNull(bankReconciliationCases.voidedAt),
          ),
        );

      const summary = {
        periodFrom: session.periodFrom,
        periodTo: session.periodTo,
        bankAccountId: session.bankAccountId,
        bankClosing: bankClose,
        bookClosing: bookClose,
        outstandingNet,
        difference: diff,
        counts: {
          total: cases.length,
          matched: cases.filter((c) => c.caseType === 'match_1_1' && c.state === 'confirmed')
            .length,
          added: cases.filter(
            (c) =>
              (c.caseType === 'create_entry' || c.caseType === 'group_match') &&
              c.state === 'confirmed',
          ).length,
          transfers: cases.filter((c) => c.caseType === 'transfer' && c.state === 'confirmed')
            .length,
          waiting: cases.filter(
            (c) => c.caseType === 'outstanding_book' && c.state === 'confirmed',
          ).length,
          excluded: cases.filter((c) => c.state === 'excluded' || c.caseType === 'duplicate')
            .length,
        },
        finishedAt: new Date().toISOString(),
        finishedBy: user.id,
      };

      await db().insert(bankReconciliationSnapshots).values({
        tenantId: user.tenantId,
        sessionId: id,
        summary,
        createdBy: user.id,
      });

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
        after: summary,
      });
    });

    revalidateRecon();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not finish reconciliation.' };
  }
}

// ─── Phase 6: Transfers & groups ─────────────────────────────────────

/**
 * Confirm a possible transfer by posting move_money to another liquid account.
 * Optional feeAmount: posts transfer for (|bank| − fee) + bank-fee expense for the fee
 * (e.g. 100,000 out, 99,500 arrives → transfer 99,500 + fee 500).
 */
export async function confirmTransferCase(input: {
  caseId: string;
  /** Counterparty bank/cash account code (the other side of the move). */
  counterpartyAccountCode: string;
  /** Optional bank fee / adjustment taken from this bank line (absolute LKR). */
  feeAmount?: number;
  /** Expense category for fee (default bank charges 6100 if present, else 6000). */
  feeExpenseCode?: string;
}): Promise<
  | { ok: true; transactionId: string; feeTransactionId?: string }
  | { ok: false; error: string }
> {
  try {
    const caseId = z.string().uuid().parse(input.caseId);
    const counterCode = input.counterpartyAccountCode.trim();
    if (!counterCode) return { ok: false, error: 'Choose the other account.' };
    const feeAmount = Math.max(0, Number(input.feeAmount ?? 0));
    if (!Number.isFinite(feeAmount)) return { ok: false, error: 'Invalid fee amount.' };
    const feeCode = (input.feeExpenseCode ?? '6100').slice(0, 20);
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
      if (c.caseType !== 'transfer' && c.caseType !== 'create_entry') {
        throw new Error('Not a transfer case.');
      }
      if (c.state === 'confirmed') throw new Error('Already confirmed.');

      const [session] = await db()
        .select()
        .from(bankReconciliationSessions)
        .where(eq(bankReconciliationSessions.id, c.sessionId))
        .limit(1);
      if (!session) throw new Error('Session not found.');

      const [bankAcc] = await db()
        .select({ code: accounts.code, name: accounts.name })
        .from(accounts)
        .where(eq(accounts.id, session.bankAccountId))
        .limit(1);
      if (!bankAcc) throw new Error('Bank account not found.');
      if (bankAcc.code === counterCode) {
        throw new Error('Pick a different account for the other side of the transfer.');
      }

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

      return { c, session, bankAcc, bankJoin };
    });

    const signed = Number(prepared.bankJoin.amount);
    const abs = Math.abs(signed);
    if (abs < 0.005) return { ok: false, error: 'Zero amount.' };
    if (feeAmount > abs + 0.001) {
      return { ok: false, error: 'Fee cannot exceed the bank amount.' };
    }

    // Money leaving this bank → from this bank to counterparty
    // Money arriving → from counterparty to this bank
    const leaving = signed < 0;
    // Fee only applies when money leaves this account (source side of transfer)
    const appliedFee = leaving && feeAmount > 0.004 ? Math.round(feeAmount * 100) / 100 : 0;
    const transferAmt = Math.round((abs - appliedFee) * 100) / 100;
    if (transferAmt < 0.005 && appliedFee < 0.005) {
      return { ok: false, error: 'Nothing left to transfer.' };
    }

    const fromCode = leaving ? prepared.bankAcc.code : counterCode;
    const toCode = leaving ? counterCode : prepared.bankAcc.code;
    const bookDomain =
      prepared.session.bookDomain === 'personal' || prepared.session.bookDomain === 'business'
        ? prepared.session.bookDomain
        : undefined;

    const { recordEntry } = await import('@/app/actions/record-entry');
    let mainTxId: string | undefined;
    let feeTxId: string | undefined;

    if (transferAmt >= 0.005) {
      const entryResult = await recordEntry({
        direction: 'move_money',
        party: 'Transfer',
        description: (prepared.bankJoin.description || 'Bank transfer').slice(0, 1000),
        amount: transferAmt,
        currency: 'LKR',
        paymentMethod: 'Bank',
        paymentAccount: { kind: 'code', value: toCode },
        fromAccount: { kind: 'code', value: fromCode },
        toAccount: { kind: 'code', value: toCode },
        date: prepared.bankJoin.date,
        bookDomain,
        forceDuplicate: true,
        receiptRef: `xfer:${prepared.bankJoin.fingerprint?.slice(0, 16) ?? prepared.bankJoin.bankLineId.slice(0, 8)}`,
      });
      if (!entryResult.success || !entryResult.transactionId) {
        return { ok: false, error: entryResult.error ?? 'Could not post transfer.' };
      }
      mainTxId = entryResult.transactionId;
    }

    if (appliedFee >= 0.005) {
      // Prefer 6100 bank charges; fall back to 6000 if chart missing
      let feeCat = feeCode;
      const feeEntry = await recordEntry({
        direction: 'money_out',
        party: 'Bank fee',
        description: `Transfer fee · ${(prepared.bankJoin.description || 'Bank').slice(0, 80)}`,
        amount: appliedFee,
        currency: 'LKR',
        paymentMethod: 'Bank',
        paymentAccount: { kind: 'code', value: prepared.bankAcc.code },
        date: prepared.bankJoin.date,
        bookDomain,
        categoryOverride: feeCat,
        forceDuplicate: true,
        receiptRef: `xfer-fee:${prepared.bankJoin.bankLineId.slice(0, 8)}`,
      });
      if (!feeEntry.success || !feeEntry.transactionId) {
        // Retry with generic expense
        if (feeCat !== '6000') {
          const retry = await recordEntry({
            direction: 'money_out',
            party: 'Bank fee',
            description: `Transfer fee · ${(prepared.bankJoin.description || 'Bank').slice(0, 80)}`,
            amount: appliedFee,
            currency: 'LKR',
            paymentMethod: 'Bank',
            paymentAccount: { kind: 'code', value: prepared.bankAcc.code },
            date: prepared.bankJoin.date,
            bookDomain,
            categoryOverride: '6000',
            forceDuplicate: true,
            receiptRef: `xfer-fee:${prepared.bankJoin.bankLineId.slice(0, 8)}`,
          });
          if (!retry.success || !retry.transactionId) {
            return {
              ok: false,
              error:
                feeEntry.error ??
                retry.error ??
                'Transfer may have posted, but fee could not be recorded.',
            };
          }
          feeTxId = retry.transactionId;
        } else {
          return {
            ok: false,
            error: feeEntry.error ?? 'Could not post bank fee adjustment.',
          };
        }
      } else {
        feeTxId = feeEntry.transactionId;
      }
    }

    if (!mainTxId && !feeTxId) {
      return { ok: false, error: 'Nothing was posted.' };
    }

    await withTenantContext(user.tenantId, async () => {
      const primaryTx = mainTxId ?? feeTxId!;
      await db()
        .update(bankStatementLines)
        .set({
          status: 'created',
          proposedAction: 'create',
          createdTransactionId: primaryTx,
          matchedTransactionId: primaryTx,
          reconciliationStatus: 'created',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankStatementLines.id, prepared.bankJoin.bankLineId));

      if (mainTxId) {
        await db().insert(bankReconciliationCaseBookTransactions).values({
          tenantId: user.tenantId,
          caseId,
          transactionId: mainTxId,
          allocatedAmount: (leaving ? -transferAmt : transferAmt).toFixed(2),
          role: 'primary',
        });
      }
      if (feeTxId) {
        await db().insert(bankReconciliationCaseBookTransactions).values({
          tenantId: user.tenantId,
          caseId,
          transactionId: feeTxId,
          allocatedAmount: (-appliedFee).toFixed(2),
          role: 'fee',
        });
      }

      await db()
        .update(bankReconciliationCases)
        .set({
          caseType: 'transfer',
          state: 'confirmed',
          resultLabel:
            appliedFee > 0 ? `Transfer + fee Rs. ${appliedFee.toFixed(2)}` : 'Transfer posted',
          userLabel: appliedFee > 0 ? 'Transfer + fee' : 'Transfer',
          explanation:
            appliedFee > 0
              ? `Transfer Rs. ${transferAmt.toFixed(2)} and bank fee Rs. ${appliedFee.toFixed(2)}.`
              : 'Transfer between your accounts.',
          reasonCodes: appliedFee > 0 ? ['transfer', 'transfer_fee'] : ['transfer'],
          createdTransactionId: primaryTx,
          confirmedBy: user.id,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationCases.id, caseId));

      await logEvent(user.tenantId, prepared.c.sessionId, user.id, 'transfer_confirmed', {
        caseId,
        after: {
          transactionId: mainTxId,
          feeTransactionId: feeTxId,
          fromCode,
          toCode,
          transferAmt,
          feeAmount: appliedFee,
        },
      });
      await refreshSessionCounts(user.tenantId, prepared.c.sessionId);
    });

    revalidateRecon();
    return { ok: true, transactionId: mainTxId ?? feeTxId!, feeTransactionId: feeTxId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not confirm transfer.' };
  }
}

/** User says this is not a transfer — treat as normal Add-to-BookOne. */
export async function rejectTransferCase(input: {
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
      if (c.caseType !== 'transfer') throw new Error('Not a transfer suggestion.');
      if (c.state === 'confirmed') throw new Error('Already confirmed.');

      await db()
        .update(bankReconciliationCases)
        .set({
          caseType: 'create_entry',
          confidence: 'none',
          explanation: 'Not a transfer — add as a normal BookOne entry.',
          reasonCodes: ['bank_only', 'not_transfer'],
          userLabel: 'Add to BookOne',
          resultLabel: 'Add entry',
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationCases.id, caseId));

      await logEvent(user.tenantId, c.sessionId, user.id, 'transfer_rejected', { caseId });
      await refreshSessionCounts(user.tenantId, c.sessionId);
    });
    revalidateRecon();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not update.' };
  }
}

/** Search free book entries for group match (one bank → many books). */
export async function searchGroupBookCandidates(input: {
  caseId: string;
  q?: string;
  limit?: number;
}): Promise<
  | {
      ok: true;
      bankAmount: number;
      candidates: {
        id: string;
        date: string;
        description: string;
        amountSigned: number;
      }[];
    }
  | { ok: false; error: string }
> {
  try {
    const caseId = z.string().uuid().parse(input.caseId);
    const q = (input.q ?? '').trim().toLowerCase();
    const limit = Math.min(40, Math.max(5, input.limit ?? 20));
    const user = await requireTenantContext();

    return withTenantContext(user.tenantId, async () => {
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

      const [session] = await db()
        .select()
        .from(bankReconciliationSessions)
        .where(eq(bankReconciliationSessions.id, c.sessionId))
        .limit(1);
      if (!session) throw new Error('Session not found.');

      const [bankJoin] = await db()
        .select({
          amount: bankStatementLines.amount,
          date: bankStatementLines.transactionDate,
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
      if (!bankJoin) throw new Error('No bank line on case.');

      const books = await loadBookCandidates(
        user.tenantId,
        session.bankAccountId,
        session.periodFrom,
        session.periodTo,
        session.bookDomain,
      );

      // Exclude books already locked to confirmed cases in this session
      const used = await db()
        .select({
          transactionId: bankReconciliationCaseBookTransactions.transactionId,
        })
        .from(bankReconciliationCaseBookTransactions)
        .innerJoin(
          bankReconciliationCases,
          eq(bankReconciliationCases.id, bankReconciliationCaseBookTransactions.caseId),
        )
        .where(
          and(
            eq(bankReconciliationCases.sessionId, c.sessionId),
            isNull(bankReconciliationCases.voidedAt),
            isNull(bankReconciliationCaseBookTransactions.voidedAt),
            inArray(bankReconciliationCases.state, ['confirmed', 'suggested', 'needs_review']),
          ),
        );
      const usedSet = new Set(used.map((u) => u.transactionId));

      let candidates = books
        .filter((b) => !usedSet.has(b.id))
        .map((b) => ({
          id: b.id,
          date: b.date,
          description: b.description,
          amountSigned: b.amountSigned,
        }));

      if (q) {
        candidates = candidates.filter(
          (b) =>
            b.description.toLowerCase().includes(q) ||
            b.date.includes(q) ||
            String(b.amountSigned).includes(q),
        );
      }

      // Prefer same direction as bank amount
      const bankAmt = Number(bankJoin.amount);
      candidates.sort((a, b) => {
        const aDir = Math.sign(a.amountSigned) === Math.sign(bankAmt) ? 0 : 1;
        const bDir = Math.sign(b.amountSigned) === Math.sign(bankAmt) ? 0 : 1;
        if (aDir !== bDir) return aDir - bDir;
        return Math.abs(Math.abs(a.amountSigned) - Math.abs(bankAmt)) -
          Math.abs(Math.abs(b.amountSigned) - Math.abs(bankAmt));
      });

      return {
        ok: true as const,
        bankAmount: bankAmt,
        candidates: candidates.slice(0, limit),
      };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Search failed.' };
  }
}

/**
 * Confirm one bank line matched to multiple BookOne records (sum must match within 0.02).
 */
export async function confirmGroupMatch(input: {
  caseId: string;
  transactionIds: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const caseId = z.string().uuid().parse(input.caseId);
    const ids = z.array(z.string().uuid()).min(1).max(8).parse(input.transactionIds);
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
      if (c.state === 'confirmed') throw new Error('Already confirmed.');
      if (
        c.caseType !== 'create_entry' &&
        c.caseType !== 'group_match' &&
        c.caseType !== 'match_1_1' &&
        c.caseType !== 'transfer'
      ) {
        throw new Error('Cannot group this case type.');
      }

      const [session] = await db()
        .select()
        .from(bankReconciliationSessions)
        .where(eq(bankReconciliationSessions.id, c.sessionId))
        .limit(1);
      if (!session) throw new Error('Session not found.');

      const [bankJoin] = await db()
        .select({
          bankLineId: bankReconciliationCaseBankLines.bankLineId,
          amount: bankStatementLines.amount,
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
      if (!bankJoin) throw new Error('No bank line.');

      const books = await loadBookCandidates(
        user.tenantId,
        session.bankAccountId,
        session.periodFrom,
        session.periodTo,
        session.bookDomain,
      );
      const byId = new Map(books.map((b) => [b.id, b]));
      let sum = 0;
      const selected: typeof books = [];
      for (const tid of ids) {
        const b = byId.get(tid);
        if (!b) throw new Error('One selected BookOne record is not available.');
        selected.push(b);
        sum += b.amountSigned;
      }
      const bankAmt = Number(bankJoin.amount);
      if (Math.abs(sum - bankAmt) > 0.02) {
        throw new Error(
          `Selected total Rs. ${sum.toFixed(2)} does not match bank Rs. ${bankAmt.toFixed(2)}.`,
        );
      }

      // Clear prior suggested book joins
      await db()
        .update(bankReconciliationCaseBookTransactions)
        .set({ voidedAt: new Date() })
        .where(
          and(
            eq(bankReconciliationCaseBookTransactions.caseId, caseId),
            isNull(bankReconciliationCaseBookTransactions.voidedAt),
          ),
        );

      for (const b of selected) {
        await db().insert(bankReconciliationCaseBookTransactions).values({
          tenantId: user.tenantId,
          caseId,
          transactionId: b.id,
          allocatedAmount: b.amountSigned.toFixed(2),
          role: selected.length === 1 ? 'primary' : 'group',
        });
      }

      await db()
        .update(bankReconciliationCases)
        .set({
          caseType: 'group_match',
          state: 'confirmed',
          confidence: 'strong',
          resultLabel: selected.length > 1 ? 'Grouped match' : 'Matched',
          userLabel: selected.length > 1 ? 'Group match' : 'Matched',
          explanation: `Matched bank line to ${selected.length} BookOne record${selected.length === 1 ? '' : 's'}.`,
          reasonCodes: selected.length > 1 ? ['group_sum_match'] : ['manual_match'],
          confirmedBy: user.id,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationCases.id, caseId));

      await db()
        .update(bankStatementLines)
        .set({
          status: 'reconciled',
          matchedTransactionId: selected[0]!.id,
          proposedAction: 'link',
          matchMethod: selected.length > 1 ? 'group' : 'manual',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankStatementLines.id, bankJoin.bankLineId));

      await logEvent(user.tenantId, c.sessionId, user.id, 'group_match_confirmed', {
        caseId,
        after: { transactionIds: ids, bankAmount: bankAmt, sum },
      });
      await refreshSessionCounts(user.tenantId, c.sessionId);
    });

    revalidateRecon();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not confirm group match.' };
  }
}

// ─── Phase 7: Governance ─────────────────────────────────────────────

/** Exclude a case with a reason (duplicate / not mine / etc.). */
export async function excludeCase(input: {
  caseId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const caseId = z.string().uuid().parse(input.caseId);
    const reason = input.reason.trim().slice(0, 80) || 'excluded';
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
      if (c.state === 'confirmed' && c.caseType === 'match_1_1') {
        throw new Error('Unlink the match first, then exclude if needed.');
      }

      await db()
        .update(bankReconciliationCases)
        .set({
          state: 'excluded',
          caseType: c.caseType === 'duplicate' ? 'duplicate' : c.caseType,
          exclusionReason: reason,
          resultLabel: 'Excluded',
          userLabel: 'Excluded',
          confirmedBy: user.id,
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationCases.id, caseId));

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
      if (bank) {
        await db()
          .update(bankStatementLines)
          .set({
            status: 'skipped',
            proposedAction: 'skip',
            reviewedByUserId: user.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bankStatementLines.id, bank.bankLineId));
      }

      await logEvent(user.tenantId, c.sessionId, user.id, 'case_excluded', {
        caseId,
        reason,
      });
      await refreshSessionCounts(user.tenantId, c.sessionId);
    });

    revalidateRecon();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not exclude.' };
  }
}

/** Reopen a finished reconciliation for further work. */
export async function reopenReconciliationSession(
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
      if (session.status !== 'reconciled' && session.status !== 'closed') {
        throw new Error('Only a finished reconciliation can be reopened.');
      }

      await db()
        .update(bankReconciliationSessions)
        .set({
          status: 'reopened',
          reconciledAt: null,
          reconciledBy: null,
          updatedAt: new Date(),
        })
        .where(eq(bankReconciliationSessions.id, id));

      await logEvent(user.tenantId, id, user.id, 'session_reopened');
    });
    revalidateRecon();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not reopen.' };
  }
}

/** Export a plain-language reconciliation summary (JSON-serializable for UI download). */
export async function exportReconciliationSummary(
  sessionId: string,
): Promise<
  | { ok: true; summary: ReconReviewSummary & { periodLabel: string; bankName: string } }
  | { ok: false; error: string }
> {
  try {
    const res = await openReconciliationSession(sessionId, { tab: 'all', page: 1, pageSize: 10 });
    if (!res.ok) return res;
    const review = res.detail.review;
    if (!review) return { ok: false, error: 'No review data.' };
    return {
      ok: true,
      summary: {
        ...review,
        periodLabel: res.detail.session.periodLabel,
        bankName: res.detail.session.bankName,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed.' };
  }
}

// ─── Many bank lines → one BookOne record ────────────────────────────

export type UnmatchedBankLineOption = {
  lineId: string;
  caseId: string | null;
  date: string;
  description: string;
  amount: number;
};

/** Open bank-side cases / free lines that can be multi-selected for N:1 match. */
export async function listUnmatchedBankLinesForSession(
  sessionId: string,
): Promise<
  { ok: true; lines: UnmatchedBankLineOption[] } | { ok: false; error: string }
> {
  try {
    const id = z.string().uuid().parse(sessionId);
    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const openCases = await db()
        .select({
          caseId: bankReconciliationCases.id,
          caseType: bankReconciliationCases.caseType,
          state: bankReconciliationCases.state,
          bankLineId: bankReconciliationCaseBankLines.bankLineId,
          date: bankStatementLines.transactionDate,
          description: bankStatementLines.description,
          amount: bankStatementLines.amount,
        })
        .from(bankReconciliationCases)
        .innerJoin(
          bankReconciliationCaseBankLines,
          and(
            eq(bankReconciliationCaseBankLines.caseId, bankReconciliationCases.id),
            isNull(bankReconciliationCaseBankLines.voidedAt),
          ),
        )
        .innerJoin(
          bankStatementLines,
          eq(bankStatementLines.id, bankReconciliationCaseBankLines.bankLineId),
        )
        .where(
          and(
            eq(bankReconciliationCases.sessionId, id),
            eq(bankReconciliationCases.tenantId, user.tenantId),
            isNull(bankReconciliationCases.voidedAt),
            inArray(bankReconciliationCases.caseType, [
              'create_entry',
              'transfer',
              'group_match',
              'match_1_1',
            ]),
            inArray(bankReconciliationCases.state, [
              'suggested',
              'needs_review',
              'deferred',
              'reopened',
            ]),
          ),
        )
        .orderBy(desc(bankStatementLines.transactionDate));

      const lines: UnmatchedBankLineOption[] = openCases.map((r) => ({
        lineId: r.bankLineId,
        caseId: r.caseId,
        date: r.date,
        description: r.description,
        amount: Number(r.amount),
      }));
      return { ok: true as const, lines };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not list bank lines.' };
  }
}

/**
 * Many bank lines → one BookOne record.
 * Voids open single-line cases for those lines and creates one confirmed group_match case.
 */
export async function confirmManyBanksOneBook(input: {
  sessionId: string;
  bankLineIds: string[];
  transactionId: string;
}): Promise<{ ok: true; caseId: string } | { ok: false; error: string }> {
  try {
    const sessionId = z.string().uuid().parse(input.sessionId);
    const bankLineIds = z.array(z.string().uuid()).min(2).max(12).parse(input.bankLineIds);
    const transactionId = z.string().uuid().parse(input.transactionId);
    const user = await requireTenantContext();

    const caseId = await withTenantContext(user.tenantId, async () => {
      const [session] = await db()
        .select()
        .from(bankReconciliationSessions)
        .where(
          and(
            eq(bankReconciliationSessions.id, sessionId),
            eq(bankReconciliationSessions.tenantId, user.tenantId),
            isNull(bankReconciliationSessions.voidedAt),
          ),
        )
        .limit(1);
      if (!session) throw new Error('Session not found.');

      const lines = await db()
        .select({
          id: bankStatementLines.id,
          date: bankStatementLines.transactionDate,
          description: bankStatementLines.description,
          amount: bankStatementLines.amount,
        })
        .from(bankStatementLines)
        .where(
          and(
            eq(bankStatementLines.tenantId, user.tenantId),
            isNull(bankStatementLines.voidedAt),
            inArray(bankStatementLines.id, bankLineIds),
          ),
        );
      if (lines.length !== bankLineIds.length) {
        throw new Error('One or more bank lines were not found.');
      }

      let bankSum = 0;
      for (const l of lines) bankSum += Number(l.amount);

      const books = await loadBookCandidates(
        user.tenantId,
        session.bankAccountId,
        session.periodFrom,
        session.periodTo,
        session.bookDomain,
      );
      const book = books.find((b) => b.id === transactionId);
      if (!book) throw new Error('BookOne record not available for this period/account.');

      if (Math.abs(bankSum - book.amountSigned) > 0.02) {
        throw new Error(
          `Bank total Rs. ${bankSum.toFixed(2)} does not match BookOne Rs. ${book.amountSigned.toFixed(2)}.`,
        );
      }

      // Void open cases that currently own these bank lines
      const owning = await db()
        .select({
          caseId: bankReconciliationCaseBankLines.caseId,
        })
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
            inArray(bankReconciliationCaseBankLines.bankLineId, bankLineIds),
            inArray(bankReconciliationCases.state, [
              'suggested',
              'needs_review',
              'deferred',
              'reopened',
            ]),
          ),
        );
      const ownIds = [...new Set(owning.map((o) => o.caseId))];
      if (ownIds.length > 0) {
        const now = new Date();
        await db()
          .update(bankReconciliationCases)
          .set({ voidedAt: now, updatedAt: now })
          .where(inArray(bankReconciliationCases.id, ownIds));
        await db()
          .update(bankReconciliationCaseBankLines)
          .set({ voidedAt: now })
          .where(inArray(bankReconciliationCaseBankLines.caseId, ownIds));
        await db()
          .update(bankReconciliationCaseBookTransactions)
          .set({ voidedAt: now })
          .where(inArray(bankReconciliationCaseBookTransactions.caseId, ownIds));
      }

      const sortDate = lines.map((l) => l.date).sort().slice(-1)[0]!;
      const [created] = await db()
        .insert(bankReconciliationCases)
        .values({
          tenantId: user.tenantId,
          sessionId,
          caseType: 'group_match',
          confidence: 'strong',
          state: 'confirmed',
          explanation: `Matched ${lines.length} bank lines to one BookOne record.`,
          reasonCodes: ['many_banks_one_book'],
          userLabel: 'Group match',
          resultLabel: `${lines.length} bank → 1 BookOne`,
          sortDate,
          sortAmount: bankSum.toFixed(2),
          confirmedBy: user.id,
          confirmedAt: new Date(),
        })
        .returning({ id: bankReconciliationCases.id });

      for (const l of lines) {
        await db().insert(bankReconciliationCaseBankLines).values({
          tenantId: user.tenantId,
          caseId: created.id,
          bankLineId: l.id,
          allocatedAmount: l.amount,
          role: 'group',
        });
        await db()
          .update(bankStatementLines)
          .set({
            status: 'reconciled',
            matchedTransactionId: transactionId,
            proposedAction: 'link',
            matchMethod: 'group',
            reviewedByUserId: user.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bankStatementLines.id, l.id));
      }

      await db().insert(bankReconciliationCaseBookTransactions).values({
        tenantId: user.tenantId,
        caseId: created.id,
        transactionId,
        allocatedAmount: book.amountSigned.toFixed(2),
        role: 'primary',
      });

      await logEvent(user.tenantId, sessionId, user.id, 'many_banks_one_book', {
        caseId: created.id,
        after: { bankLineIds, transactionId, bankSum },
      });
      await refreshSessionCounts(user.tenantId, sessionId);
      return created.id;
    });

    revalidateRecon();
    return { ok: true, caseId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not confirm multi-bank match.',
    };
  }
}

/** Search book candidates for N:1 match (by session, optional amount target). */
export async function searchBookForSession(input: {
  sessionId: string;
  q?: string;
  targetAmount?: number;
  limit?: number;
}): Promise<
  | {
      ok: true;
      candidates: {
        id: string;
        date: string;
        description: string;
        amountSigned: number;
      }[];
    }
  | { ok: false; error: string }
> {
  try {
    const sessionId = z.string().uuid().parse(input.sessionId);
    const q = (input.q ?? '').trim().toLowerCase();
    const limit = Math.min(40, Math.max(5, input.limit ?? 20));
    const user = await requireTenantContext();

    return withTenantContext(user.tenantId, async () => {
      const [session] = await db()
        .select()
        .from(bankReconciliationSessions)
        .where(
          and(
            eq(bankReconciliationSessions.id, sessionId),
            eq(bankReconciliationSessions.tenantId, user.tenantId),
            isNull(bankReconciliationSessions.voidedAt),
          ),
        )
        .limit(1);
      if (!session) throw new Error('Session not found.');

      const books = await loadBookCandidates(
        user.tenantId,
        session.bankAccountId,
        session.periodFrom,
        session.periodTo,
        session.bookDomain,
      );

      let candidates = books.map((b) => ({
        id: b.id,
        date: b.date,
        description: b.description,
        amountSigned: b.amountSigned,
      }));
      if (q) {
        candidates = candidates.filter(
          (b) =>
            b.description.toLowerCase().includes(q) ||
            b.date.includes(q) ||
            String(b.amountSigned).includes(q),
        );
      }
      if (input.targetAmount != null && Number.isFinite(input.targetAmount)) {
        const t = Number(input.targetAmount);
        candidates.sort(
          (a, b) =>
            Math.abs(a.amountSigned - t) - Math.abs(b.amountSigned - t),
        );
      }
      return { ok: true as const, candidates: candidates.slice(0, limit) };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Search failed.' };
  }
}

// ─── Guided queue + formal report ────────────────────────────────────

/** Ordered open cases for fix-one-by-one guided mode. */
export async function listGuidedQueue(
  sessionId: string,
): Promise<
  | { ok: true; cases: ReconCaseRow[]; session: ReconSessionListItem }
  | { ok: false; error: string }
> {
  try {
    const res = await openReconciliationSession(sessionId, {
      tab: 'all',
      page: 1,
      pageSize: 50,
    });
    if (!res.ok) return res;
    const open = res.detail.cases.filter(
      (c) => c.state !== 'confirmed' && c.state !== 'excluded',
    );
    // Priority: decision → transfer → add/group → ready → waiting
    const rank = (c: ReconCaseRow) => {
      if (c.caseType === 'match_1_1' && !(c.state === 'suggested' && c.confidence === 'strong'))
        return 0;
      if (c.caseType === 'transfer') return 1;
      if (c.caseType === 'create_entry' || c.caseType === 'group_match') return 2;
      if (c.caseType === 'match_1_1') return 3;
      if (c.caseType === 'outstanding_book') return 4;
      return 5;
    };
    open.sort((a, b) => rank(a) - rank(b) || (b.sortDate ?? '').localeCompare(a.sortDate ?? ''));

    // Load more pages if needed for queue
    let allOpen = open;
    if (res.detail.totalCases > 50) {
      const full = await openReconciliationSession(sessionId, {
        tab: 'all',
        page: 1,
        pageSize: 50,
      });
      // Prefer decision/transfers/add tabs
      const tabs = ['decision', 'transfers', 'add', 'ready', 'waiting'] as const;
      const collected: ReconCaseRow[] = [];
      for (const t of tabs) {
        const part = await openReconciliationSession(sessionId, {
          tab: t,
          page: 1,
          pageSize: 30,
        });
        if (part.ok) {
          for (const c of part.detail.cases) {
            if (c.state === 'confirmed' || c.state === 'excluded') continue;
            if (!collected.some((x) => x.id === c.id)) collected.push(c);
          }
        }
      }
      if (collected.length) allOpen = collected;
      void full;
    }

    return {
      ok: true,
      cases: allOpen,
      session: res.detail.session,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not load guided queue.' };
  }
}

export type ReconReportData = {
  companyName: string;
  bankName: string;
  bankCode: string;
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  statementOpening: number | null;
  statementClosing: number | null;
  bookClosing: number | null;
  outstandingNet: number;
  difference: number;
  status: string;
  statusLabel: string;
  reconciledAt: string | null;
  sourceFiles: { fileName: string }[];
  review: ReconReviewSummary;
  lines: {
    caseType: string;
    state: string;
    resultLabel: string | null;
    bankDate: string | null;
    bankDesc: string | null;
    bankAmount: number | null;
    bookDate: string | null;
    bookDesc: string | null;
    bookAmount: number | null;
  }[];
};

/** Full formal report payload for printable PDF view. */
export async function getReconciliationReportData(
  sessionId: string,
): Promise<{ ok: true; data: ReconReportData } | { ok: false; error: string }> {
  try {
    const id = z.string().uuid().parse(sessionId);
    const user = await requireTenantContext();

    const data = await withTenantContext(user.tenantId, async () => {
      const detailRes = await openReconciliationSession(id, {
        tab: 'all',
        page: 1,
        pageSize: 50,
      });
      if (!detailRes.ok) throw new Error(detailRes.error);
      const d = detailRes.detail;
      if (!d.review) throw new Error('No review data.');

      // Gather more lines across pages (cap 200)
      const allCases: ReconCaseRow[] = [...d.cases];
      const pages = Math.min(4, Math.ceil(d.totalCases / 50));
      for (let p = 2; p <= pages; p++) {
        const more = await openReconciliationSession(id, {
          tab: 'all',
          page: p,
          pageSize: 50,
        });
        if (more.ok) allCases.push(...more.detail.cases);
      }

      const { tenants } = await import('@bookone/db');
      const [tenant] = await db()
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, user.tenantId))
        .limit(1);

      const [session] = await db()
        .select()
        .from(bankReconciliationSessions)
        .where(eq(bankReconciliationSessions.id, id))
        .limit(1);

      return {
        companyName: tenant?.name ?? 'Company',
        bankName: d.session.bankName,
        bankCode: d.session.bankCode,
        periodLabel: d.session.periodLabel,
        periodFrom: d.session.periodFrom,
        periodTo: d.session.periodTo,
        statementOpening:
          session?.statementOpeningBalance != null
            ? Number(session.statementOpeningBalance)
            : null,
        statementClosing: d.session.statementClosingBalance,
        bookClosing: d.session.bookClosingBalance,
        outstandingNet: d.session.outstandingNet,
        difference: d.review.difference,
        status: d.session.status,
        statusLabel: d.session.statusLabel,
        reconciledAt: session?.reconciledAt?.toISOString() ?? null,
        sourceFiles: d.session.sourceFiles.map((f) => ({ fileName: f.fileName })),
        review: d.review,
        lines: allCases.map((c) => ({
          caseType: c.caseType,
          state: c.state,
          resultLabel: c.resultLabel,
          bankDate: c.bank.date,
          bankDesc: c.bank.description,
          bankAmount: c.bank.amount,
          bookDate: c.book.date,
          bookDesc: c.book.description,
          bookAmount: c.book.amount,
        })),
      } satisfies ReconReportData;
    });

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not build report.' };
  }
}

/**
 * Soft-delete (void) a bank import sheet and detach it from recon sessions.
 * Does not reverse already-posted cashbook journals.
 */
export async function voidBankImport(
  importId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

      const now = new Date();

      // Void lines
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

      // Detach from sessions
      const links = await db()
        .select({
          id: bankReconciliationSessionImports.id,
          sessionId: bankReconciliationSessionImports.sessionId,
        })
        .from(bankReconciliationSessionImports)
        .where(
          and(
            eq(bankReconciliationSessionImports.importId, id),
            eq(bankReconciliationSessionImports.tenantId, user.tenantId),
          ),
        );

      if (links.length) {
        await db()
          .delete(bankReconciliationSessionImports)
          .where(
            and(
              eq(bankReconciliationSessionImports.importId, id),
              eq(bankReconciliationSessionImports.tenantId, user.tenantId),
            ),
          );
      }

      await db()
        .update(bankStatementImports)
        .set({
          voidedAt: now,
          wizardStatus: 'voided',
          status: 'voided',
          updatedAt: now,
        })
        .where(eq(bankStatementImports.id, id));

      // Rebuild attached sessions so cases drop voided lines
      for (const link of links) {
        try {
          await rebuildSessionSuggestionsInternal(user.tenantId, user.id, link.sessionId);
        } catch {
          /* session may be empty */
        }
      }
    });

    revalidateRecon();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not delete import.' };
  }
}

/** List committed imports for a tenant (for delete UI). */
export async function listBankImports(): Promise<
  {
    id: string;
    fileName: string;
    periodLabel: string;
    bankName: string;
    lineCount: number;
    status: string;
    createdAt: string;
  }[]
> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: bankStatementImports.id,
        fileName: bankStatementImports.fileName,
        periodFrom: bankStatementImports.periodFrom,
        periodTo: bankStatementImports.periodTo,
        period: bankStatementImports.period,
        bankAccountId: bankStatementImports.bankAccountId,
        status: bankStatementImports.wizardStatus,
        rowCount: bankStatementImports.rowCount,
        createdAt: bankStatementImports.createdAt,
      })
      .from(bankStatementImports)
      .where(
        and(
          eq(bankStatementImports.tenantId, user.tenantId),
          isNull(bankStatementImports.voidedAt),
        ),
      )
      .orderBy(desc(bankStatementImports.createdAt))
      .limit(50);

    const bankIds = [
      ...new Set(rows.map((r) => r.bankAccountId).filter(Boolean) as string[]),
    ];
    const bankMap = new Map<string, string>();
    if (bankIds.length) {
      const banks = await db()
        .select({ id: accounts.id, name: accounts.name, code: accounts.code })
        .from(accounts)
        .where(and(eq(accounts.tenantId, user.tenantId), inArray(accounts.id, bankIds)));
      for (const b of banks) bankMap.set(b.id, `${b.name} · ${b.code}`);
    }

    return rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      periodLabel:
        r.periodFrom && r.periodTo
          ? formatPeriodLabel(r.periodFrom, r.periodTo)
          : r.period || '—',
      bankName: r.bankAccountId ? bankMap.get(r.bankAccountId) ?? 'Bank' : 'Unassigned',
      lineCount: Number(r.rowCount || 0),
      status: r.status ?? 'open',
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

/** Compat: import id → session id (for redirects). */
export async function resolveImportToSession(
  importId: string,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  return getOrCreateSessionFromImport(importId);
}
