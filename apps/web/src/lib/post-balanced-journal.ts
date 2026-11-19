import {
  accounts,
  auditLog,
  db,
  journalEntries,
  journalLines,
  periodLocks,
  transactions,
  and,
  eq,
  isNull,
} from '@bookone/db';
import type { JournalLineDraft } from '@bookone/accounting';

export type PostedJournal = {
  transactionId: string;
  journalId: string;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function assertPeriodUnlocked(tenantId: string, isoDate: string): Promise<string | null> {
  const period = isoDate.slice(0, 7);
  const [lock] = await db()
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(
      and(
        eq(periodLocks.tenantId, tenantId),
        eq(periodLocks.period, period),
        eq(periodLocks.status, 'locked'),
        isNull(periodLocks.voidedAt),
      ),
    )
    .limit(1);
  if (lock) return `Period ${period} is locked.`;
  return null;
}

export async function resolveAccountByCode(
  tenantId: string,
  code: string,
): Promise<{ id: string; code: string; name: string; isGroup: string | null; isActive: string } | null> {
  const [row] = await db()
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      isGroup: accounts.isGroup,
      isActive: accounts.isActive,
    })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code), isNull(accounts.voidedAt)))
    .limit(1);
  return row ?? null;
}

export async function postBalancedJournal(input: {
  tenantId: string;
  userId: string;
  date: string;
  party: string;
  description: string;
  accountingType: string;
  direction: string;
  paymentMethod: string;
  paymentAccountId: string;
  lines: JournalLineDraft[];
  notes?: string | null;
  auditTable?: string;
  auditRecordId?: string;
}): Promise<PostedJournal> {
  const debit = roundMoney(input.lines.filter((l) => l.side === 'debit').reduce((s, l) => s + Number(l.amount), 0));
  const credit = roundMoney(input.lines.filter((l) => l.side === 'credit').reduce((s, l) => s + Number(l.amount), 0));
  if (Math.abs(debit - credit) >= 0.005) {
    throw new Error(`Journal is not balanced (debits ${debit.toFixed(2)}, credits ${credit.toFixed(2)}).`);
  }
  const amount = Math.max(debit, credit);
  const codeIds = new Map<string, string>();
  for (const line of input.lines) {
    if (codeIds.has(line.accountCode)) continue;
    const account = await resolveAccountByCode(input.tenantId, line.accountCode);
    if (!account) throw new Error(`Account ${line.accountCode} was not found.`);
    if (account.isGroup === '1') throw new Error(`Cannot post to group account ${line.accountCode}.`);
    if (account.isActive !== '1') throw new Error(`Account ${line.accountCode} is archived.`);
    codeIds.set(line.accountCode, account.id);
  }

  return db().transaction(async (tx) => {
    const [insertedTransaction] = await tx
      .insert(transactions)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        accountingType: input.accountingType,
        direction: input.direction,
        party: input.party,
        description: input.description,
        amount: amount.toFixed(2),
        currency: 'LKR',
        paymentMethod: input.paymentMethod,
        paymentAccountId: input.paymentAccountId,
        date: input.date,
        notes: input.notes ?? null,
        isAlreadySettled: '1',
      })
      .returning({ id: transactions.id });
    if (!insertedTransaction) throw new Error('Could not create transaction.');

    const [insertedJournal] = await tx
      .insert(journalEntries)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        transactionId: insertedTransaction.id,
        memo: input.description,
        entryDate: input.date,
        isBalanced: '1',
        notes: input.notes ?? null,
      })
      .returning({ id: journalEntries.id });
    if (!insertedJournal) throw new Error('Could not create journal.');

    for (const line of input.lines) {
      const accountId = codeIds.get(line.accountCode);
      if (!accountId) throw new Error(`Account ${line.accountCode} was not resolved.`);
      await tx.insert(journalLines).values({
        tenantId: input.tenantId,
        journalEntryId: insertedJournal.id,
        accountId,
        side: line.side,
        amount: Number(line.amount).toFixed(2),
        memo: line.memo,
      });
    }

    await tx.insert(auditLog).values({
      tenantId: input.tenantId,
      userId: input.userId,
      action: 'CREATE',
      tableName: input.auditTable ?? 'transactions',
      recordId: input.auditRecordId ?? insertedTransaction.id,
      newValues: {
        description: input.description,
        amount,
        lines: input.lines,
      },
    });

    return { transactionId: insertedTransaction.id, journalId: insertedJournal.id };
  });
}
