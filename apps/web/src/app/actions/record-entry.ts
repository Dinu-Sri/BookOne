'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { inferTransaction } from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  db,
  transactions,
  journalEntries,
  journalLines,
  auditLog,
  accounts,
  periodLocks,
  withTenantContext,
  eq,
  and,
  isNull,
  desc,
} from '@bookone/db';
import { entrySchema, type EntryInput } from '@/lib/entry-schema';

export interface RecordEntryResult {
  success: boolean;
  transactionId?: string;
  journalId?: string;
  error?: string;
}

export interface ReversalResult {
  success: boolean;
  reversalTransactionId?: string;
  reversalJournalId?: string;
  error?: string;
}

async function resolveAccountId(code: string): Promise<string> {
  const [account] = await db()
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.code, code))
    .limit(1);

  if (!account) {
    throw new Error(`Account code ${code} not found in chart of accounts.`);
  }

  return account.id;
}

export async function recordEntry(input: EntryInput): Promise<RecordEntryResult> {
  try {
    const parsed = entrySchema.parse(input);
    const user = await requireTenantContext();
    const entryPeriod = parsed.date.slice(0, 7);

    const [lock] = await withTenantContext(user.tenantId, async () => {
      return db()
        .select({ id: periodLocks.id })
        .from(periodLocks)
        .where(
          and(
            eq(periodLocks.tenantId, user.tenantId),
            eq(periodLocks.period, entryPeriod),
            eq(periodLocks.status, 'locked'),
            isNull(periodLocks.voidedAt),
          ),
        )
        .limit(1);
    });
    if (lock) {
      return {
        success: false,
        error: `Period ${entryPeriod} is locked. Create a reversing entry in the current period instead.`,
      };
    }

    const engineEntry = {
      tenantId: user.tenantId,
      userId: user.id,
      ...parsed,
    } as Parameters<typeof inferTransaction>[0];

    const { transaction, journal } = inferTransaction(engineEntry);

    // Resolve account codes to DB IDs for journal line inserts
    const accountIdMap = new Map<string, string>();
    for (const line of journal.lines) {
      if (!accountIdMap.has(line.account.code)) {
        accountIdMap.set(line.account.code, await resolveAccountId(line.account.code));
      }
    }
    const paymentAccountId = await resolveAccountId(transaction.paymentAccount.code);
    let transferSourceAccountId: string | null = null;
    if (transaction.transferSourceAccount) {
      transferSourceAccountId = await resolveAccountId(transaction.transferSourceAccount.code);
    }

    // Execute everything in one DB transaction
    const result = await withTenantContext(user.tenantId, async () => {
      return db().transaction(async (tx) => {
        const [insertedTransaction] = await tx
          .insert(transactions)
          .values({
            tenantId: transaction.tenantId,
            userId: transaction.userId,
            accountingType: transaction.accountingType,
            direction: transaction.direction,
            party: transaction.party,
            description: transaction.description,
            amount: transaction.amount.toString(),
            currency: transaction.currency,
            paymentMethod: transaction.paymentMethod,
            paymentAccountId,
            transferSourceAccountId,
            date: transaction.date,
            receiptRef: transaction.receiptRef ?? null,
            categoryCode: transaction.category?.accountCode ?? null,
            categoryName: transaction.category?.categoryName ?? null,
            categoryConfidence: transaction.category?.confidence?.toString() ?? null,
            categorySource: transaction.category?.source ?? null,
            invoiceRef: transaction.invoiceRef,
            isAlreadySettled: transaction.isAlreadySettled ? '1' : '0',
            notes: transaction.notes.length > 0 ? transaction.notes.join('\n') : null,
          })
          .returning({ id: transactions.id });

        const [insertedJournal] = await tx
          .insert(journalEntries)
          .values({
            tenantId: transaction.tenantId,
            userId: transaction.userId,
            transactionId: insertedTransaction.id,
            memo: journal.memo,
            entryDate: transaction.date,
            isBalanced: '1',
          })
          .returning({ id: journalEntries.id });

        for (const line of journal.lines) {
          const accountId = accountIdMap.get(line.account.code);
          if (!accountId) {
            throw new Error(`Account ${line.account.code} not resolved.`);
          }
          await tx.insert(journalLines).values({
            tenantId: transaction.tenantId,
            journalEntryId: insertedJournal.id,
            accountId,
            side: line.side,
            amount: line.amount.toString(),
            memo: line.memo ?? null,
          });
        }

        await tx.insert(auditLog).values({
          tenantId: transaction.tenantId,
          userId: transaction.userId,
          action: 'CREATE',
          tableName: 'transactions',
          recordId: insertedTransaction.id,
          newValues: {
            accountingType: transaction.accountingType,
            direction: transaction.direction,
            party: transaction.party,
            amount: transaction.amount,
            description: transaction.description,
            category: transaction.category?.categoryName ?? null,
            entryInput: parsed,
            journalMemo: journal.memo,
            journalLineCount: journal.lines.length,
          },
          notes: `Engine inference: confidence=${transaction.category?.confidence ?? 'N/A'}, source=${transaction.category?.source ?? 'N/A'}`,
        });

        return {
          transactionId: insertedTransaction.id,
          journalId: insertedJournal.id,
        };
      });
    });

    revalidatePath('/');
    return { success: true, ...result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map((e) => e.message).join(', ')}`,
      };
    }
    const message = error instanceof Error ? error.message : 'Unknown error recording entry';
    console.error('Record entry failed:', message, error);
    return { success: false, error: message };
  }
}

export async function createReversingEntry(formData: FormData): Promise<ReversalResult> {
  try {
    const transactionId = String(formData.get('transactionId') ?? '');
    if (!transactionId) return { success: false, error: 'Missing transaction id.' };

    const user = await requireTenantContext();
    const reversalDate = new Date().toISOString().slice(0, 10);
    const reversalPeriod = reversalDate.slice(0, 7);

    const [lock] = await withTenantContext(user.tenantId, async () => {
      return db()
        .select({ id: periodLocks.id })
        .from(periodLocks)
        .where(
          and(
            eq(periodLocks.tenantId, user.tenantId),
            eq(periodLocks.period, reversalPeriod),
            eq(periodLocks.status, 'locked'),
            isNull(periodLocks.voidedAt),
          ),
        )
        .limit(1);
    });
    if (lock) {
      return { success: false, error: `Current period ${reversalPeriod} is locked.` };
    }

    const result = await withTenantContext(user.tenantId, async () => {
      const [original] = await db()
        .select({
          id: transactions.id,
          accountingType: transactions.accountingType,
          direction: transactions.direction,
          party: transactions.party,
          description: transactions.description,
          amount: transactions.amount,
          currency: transactions.currency,
          paymentMethod: transactions.paymentMethod,
          paymentAccountId: transactions.paymentAccountId,
          transferSourceAccountId: transactions.transferSourceAccountId,
          receiptRef: transactions.receiptRef,
          categoryCode: transactions.categoryCode,
          categoryName: transactions.categoryName,
          categoryConfidence: transactions.categoryConfidence,
          categorySource: transactions.categorySource,
          invoiceRef: transactions.invoiceRef,
          isAlreadySettled: transactions.isAlreadySettled,
          reversedByTransactionId: transactions.reversedByTransactionId,
          reversesTransactionId: transactions.reversesTransactionId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.tenantId, user.tenantId),
            eq(transactions.id, transactionId),
            isNull(transactions.voidedAt),
          ),
        )
        .limit(1);

      if (!original) throw new Error('Original transaction not found.');
      if (original.reversedByTransactionId) throw new Error('This transaction already has a reversing entry.');
      if (original.reversesTransactionId) throw new Error('A reversing entry cannot be reversed again.');

      const [originalJournal] = await db()
        .select({ id: journalEntries.id, memo: journalEntries.memo })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.tenantId, user.tenantId),
            eq(journalEntries.transactionId, transactionId),
            isNull(journalEntries.voidedAt),
          ),
        )
        .orderBy(desc(journalEntries.createdAt))
        .limit(1);
      if (!originalJournal) throw new Error('Original journal entry not found.');

      const originalLines = await db()
        .select({
          accountId: journalLines.accountId,
          side: journalLines.side,
          amount: journalLines.amount,
          memo: journalLines.memo,
        })
        .from(journalLines)
        .where(
          and(
            eq(journalLines.tenantId, user.tenantId),
            eq(journalLines.journalEntryId, originalJournal.id),
            isNull(journalLines.voidedAt),
          ),
        );
      if (originalLines.length === 0) throw new Error('Original journal lines not found.');

      return db().transaction(async (tx) => {
        const [reversalTx] = await tx
          .insert(transactions)
          .values({
            tenantId: user.tenantId,
            userId: user.id,
            accountingType: original.accountingType,
            direction: original.direction,
            party: original.party,
            description: `Reversal: ${original.description}`.slice(0, 1000),
            amount: original.amount,
            currency: original.currency,
            paymentMethod: original.paymentMethod,
            paymentAccountId: original.paymentAccountId,
            transferSourceAccountId: original.transferSourceAccountId,
            reversesTransactionId: original.id,
            receiptRef: original.receiptRef,
            categoryCode: original.categoryCode,
            categoryName: original.categoryName,
            categoryConfidence: original.categoryConfidence,
            categorySource: 'reversal',
            invoiceRef: original.invoiceRef,
            isAlreadySettled: original.isAlreadySettled,
            date: reversalDate,
            notes: `Reverses transaction ${original.id}`,
          })
          .returning({ id: transactions.id });

        const [reversalJournal] = await tx
          .insert(journalEntries)
          .values({
            tenantId: user.tenantId,
            userId: user.id,
            transactionId: reversalTx.id,
            memo: `Reversal of ${originalJournal.memo}`,
            entryDate: reversalDate,
            isBalanced: '1',
          })
          .returning({ id: journalEntries.id });

        for (const line of originalLines) {
          await tx.insert(journalLines).values({
            tenantId: user.tenantId,
            journalEntryId: reversalJournal.id,
            accountId: line.accountId,
            side: line.side === 'debit' ? 'credit' : 'debit',
            amount: line.amount,
            memo: line.memo ? `Reverse: ${line.memo}`.slice(0, 500) : 'Reversal line',
          });
        }

        await tx
          .update(transactions)
          .set({ reversedByTransactionId: reversalTx.id, updatedAt: new Date() })
          .where(and(eq(transactions.tenantId, user.tenantId), eq(transactions.id, original.id)));

        await tx.insert(auditLog).values({
          tenantId: user.tenantId,
          userId: user.id,
          action: 'REVERSE',
          tableName: 'transactions',
          recordId: reversalTx.id,
          newValues: {
            reversesTransactionId: original.id,
            reversalJournalId: reversalJournal.id,
            reversalDate,
          },
          notes: 'Created reversing entry without editing the original transaction.',
        });

        return {
          reversalTransactionId: reversalTx.id,
          reversalJournalId: reversalJournal.id,
        };
      });
    });

    revalidatePath('/transactions');
    revalidatePath('/journal');
    revalidatePath('/reports');
    revalidatePath('/accounts');
    return { success: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error creating reversing entry';
    console.error('createReversingEntry failed:', message, error);
    return { success: false, error: message };
  }
}

export async function reverseTransactionFromForm(formData: FormData): Promise<void> {
  await createReversingEntry(formData);
}
