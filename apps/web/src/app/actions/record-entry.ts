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
  withTenantContext,
  eq,
} from '@bookone/db';
import { entrySchema, type EntryInput } from '@/lib/entry-schema';

export interface RecordEntryResult {
  success: boolean;
  transactionId?: string;
  journalId?: string;
  error?: string;
}

async function resolveAccountId(code: string): Promise<string> {
  const [account] = await db
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
      return db.transaction(async (tx) => {
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
