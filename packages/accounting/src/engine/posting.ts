import { inferCategory } from '../inference/category-inferrer';
import { resolveAccount } from '../inference/account-resolver';
import { buildInferredTransaction, isSettledOnPosting, mapToAccountingType } from '../inference/type-mapper';
import type { InferredTransaction, JournalDraft, SimpleEntry } from '../inference/types';
import { generateJournal } from './journal-generator';

export interface EngineResult {
  transaction: InferredTransaction;
  journal: JournalDraft;
}

export function inferTransaction(entry: SimpleEntry): EngineResult {
  const paymentAccount = resolveAccount(entry.paymentAccount);

  let category: InferredTransaction['category'] = null;
  if (entry.direction === 'money_out') {
    category = inferCategory(entry.description, entry.party, 'money_out', entry.categoryOverride);
  } else if (entry.direction === 'invoice_bill' && entry.invoiceType === 'vendor_bill') {
    category = inferCategory(entry.description, entry.party, 'money_out', entry.categoryOverride);
  }

  const accountingType = mapToAccountingType(entry);
  const isAlreadySettled = isSettledOnPosting(accountingType, entry.paymentMethod);

  let transferSourceAccount: InferredTransaction['transferSourceAccount'] = null;
  if (entry.direction === 'move_money') {
    transferSourceAccount = resolveAccount(entry.fromAccount);
  }

  const transaction = buildInferredTransaction(entry, {
    tenantId: entry.tenantId,
    userId: entry.userId,
    direction: entry.direction,
    accountingType,
    party: entry.party,
    description: entry.description,
    amount: entry.amount,
    currency: entry.currency ?? 'LKR',
    paymentMethod: entry.paymentMethod,
    paymentAccount,
    transferSourceAccount,
    date: entry.date,
    receiptRef: entry.receiptRef,
    category,
    invoiceRef: entry.direction === 'money_in' && entry.moneyInType === 'customer_payment' ? entry.invoiceRef ?? null : null,
    isAlreadySettled,
  });

  const journal = generateJournal(transaction);
  return { transaction, journal };
}
