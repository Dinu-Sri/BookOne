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
import { centsToString, sideTotalsCents, toCents, type JournalLineDraft } from '@bookone/accounting';

export type PostedJournal = {
  transactionId: string;
  journalId: string;
};

// CoreGuard Step 2: the period check is guard G05 in the database (assertPeriodUnlocked removed).

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
  // Exact integer cents (CoreGuard D3): each line must be an exact 2-decimal amount; debits === credits.
  const { debit, credit } = sideTotalsCents(input.lines);
  if (debit !== credit) {
    throw new Error(`Journal is not balanced (debits ${centsToString(debit)}, credits ${centsToString(credit)}).`);
  }
  const amount = centsToString(debit);
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
        amount,
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

    // All lines in one multi-row insert (CoreGuard §4.2).
    await tx.insert(journalLines).values(
      input.lines.map((line) => {
        const accountId = codeIds.get(line.accountCode);
        if (!accountId) throw new Error(`Account ${line.accountCode} was not resolved.`);
        return {
          tenantId: input.tenantId,
          journalEntryId: insertedJournal.id,
          accountId,
          side: line.side,
          amount: centsToString(toCents(line.amount)),
          memo: line.memo,
        };
      }),
    );

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
