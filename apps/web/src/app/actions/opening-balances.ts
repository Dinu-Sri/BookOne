'use server';

import { userMessageForError } from '@/lib/coreguard-errors';
import { revalidatePath } from 'next/cache';
import { previewOpeningBalances, type JournalLineDraft, type OpeningLineInput } from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  auditLog,
  db,
  openingBalanceLines,
  openingBalanceRuns,
  withTenantContext,
  and,
  eq,
  isNull,
} from '@bookone/db';
import { assertPermission } from '@/lib/access';
import { postBalancedJournal } from '@/lib/post-balanced-journal';

export type OpeningResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; issues?: string[]; data?: T };

export async function previewOpening(input: {
  effectiveDate: string;
  lines: OpeningLineInput[];
}): Promise<OpeningResult<ReturnType<typeof previewOpeningBalances>>> {
  try {
    await assertPermission('accounting.accounts.write', 'write');
    const preview = previewOpeningBalances(input.lines);
    if (!preview.balanced || preview.issues.length) {
      return {
        ok: false,
        error: preview.issues[0] ?? 'Opening entries do not balance.',
        issues: preview.issues,
        data: preview,
      };
    }
    return { ok: true, data: preview };
  } catch (e) {
    return { ok: false, error: userMessageForError(e, 'Could not preview opening balances.') };
  }
}

export async function postOpeningBalances(input: {
  effectiveDate: string;
  lines: OpeningLineInput[];
  notes?: string;
}): Promise<OpeningResult<{ runId: string; journalId: string }>> {
  try {
    await assertPermission('accounting.accounts.write', 'write');
    const user = await requireTenantContext();
    const preview = previewOpeningBalances(input.lines);
    if (!preview.balanced || preview.issues.length) {
      return { ok: false, error: preview.issues[0] ?? 'Opening entries do not balance.', issues: preview.issues };
    }
    return withTenantContext(user.tenantId, async () => {
      const [dup] = await db()
        .select({ id: openingBalanceRuns.id })
        .from(openingBalanceRuns)
        .where(
          and(
            eq(openingBalanceRuns.tenantId, user.tenantId),
            eq(openingBalanceRuns.fingerprint, preview.fingerprint),
            eq(openingBalanceRuns.status, 'posted'),
            isNull(openingBalanceRuns.voidedAt),
          ),
        )
        .limit(1);
      if (dup) return { ok: false, error: 'These opening balances were already posted.' };
      const chart = await db()
        .select({ id: accounts.id, code: accounts.code, isGroup: accounts.isGroup })
        .from(accounts)
        .where(and(eq(accounts.tenantId, user.tenantId), isNull(accounts.voidedAt)));
      const byCode = new Map(chart.map((row) => [row.code, row]));
      const journalLines: JournalLineDraft[] = [];
      for (const line of input.lines) {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (debit === 0 && credit === 0) continue;
        const account = byCode.get(line.accountCode);
        if (!account) return { ok: false, error: `Account ${line.accountCode} was not found.` };
        if (account.isGroup === '1') return { ok: false, error: `Cannot post opening balances to group ${line.accountCode}.` };
        if (debit > 0) journalLines.push({ accountCode: line.accountCode, side: 'debit' as const, amount: debit, memo: 'Opening balance' });
        if (credit > 0) journalLines.push({ accountCode: line.accountCode, side: 'credit' as const, amount: credit, memo: 'Opening balance' });
      }
      const equity = byCode.get('3000') ?? chart[0];
      if (!equity) return { ok: false, error: 'Chart of accounts is empty.' };
      // One DB transaction for the whole action (CoreGuard §4.2): journal, run, run lines and audit commit together.
      const { run, posted } = await db().transaction(async () => {
        const posted = await postBalancedJournal({
          tenantId: user.tenantId,
          userId: user.id,
          date: input.effectiveDate,
          party: 'Opening balances',
          description: `Opening balances ${input.effectiveDate}`,
          accountingType: 'transfer',
          direction: 'in',
          paymentMethod: 'Bank',
          paymentAccountId: equity.id,
          lines: journalLines,
          notes: input.notes ?? null,
          auditTable: 'opening_balance_runs',
        });
        const [run] = await db()
          .insert(openingBalanceRuns)
          .values({
            tenantId: user.tenantId,
            effectiveDate: input.effectiveDate,
            status: 'posted',
            fingerprint: preview.fingerprint,
            debitTotal: preview.debitTotal.toFixed(2),
            creditTotal: preview.creditTotal.toFixed(2),
            sourceTransactionId: posted.transactionId,
            sourceJournalId: posted.journalId,
            notes: input.notes ?? null,
            createdBy: user.id,
            postedAt: new Date(),
          })
          .returning({ id: openingBalanceRuns.id });
        if (!run) throw new Error('Could not store the opening run.');
        for (const line of input.lines) {
          const debit = Number(line.debit) || 0;
          const credit = Number(line.credit) || 0;
          if (debit === 0 && credit === 0) continue;
          const account = byCode.get(line.accountCode);
          if (!account) continue;
          await db().insert(openingBalanceLines).values({
            tenantId: user.tenantId,
            runId: run.id,
            accountId: account.id,
            debit: debit.toFixed(2),
            credit: credit.toFixed(2),
          });
        }
        await db().insert(auditLog).values({
          tenantId: user.tenantId,
          userId: user.id,
          action: 'CREATE',
          tableName: 'opening_balance_runs',
          recordId: run.id,
          newValues: { fingerprint: preview.fingerprint, date: input.effectiveDate },
        });
        return { run, posted };
      });
      revalidatePath('/accounts');
      revalidatePath('/accounts/opening');
      return { ok: true, data: { runId: run.id, journalId: posted.journalId } };
    });
  } catch (e) {
    return { ok: false, error: userMessageForError(e, 'Could not post opening balances.') };
  }
}
