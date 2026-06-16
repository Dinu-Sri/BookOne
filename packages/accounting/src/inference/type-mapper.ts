import type { AccountingType, InferredTransaction, PaymentMethod, SimpleEntry } from './types';
import { inferCategory } from './category-inferrer';

export function mapToAccountingType(entry: SimpleEntry): AccountingType {
  if (entry.direction === 'money_in') {
    if (entry.moneyInType === 'customer_payment') return 'Receive';
    if (entry.moneyInType === 'new_sale') return 'Sale';
    return 'Owner';
  }
  if (entry.direction === 'money_out') {
    const category = inferCategory(entry.description, entry.party, 'money_out', entry.categoryOverride);
    if (category.accountCode === '3100') return 'Owner';
    return 'Expense';
  }
  if (entry.direction === 'move_money') {
    return 'Transfer';
  }
  if (entry.direction === 'invoice_bill') {
    return entry.invoiceType === 'customer_invoice' ? 'SaleCredit' : 'PurchaseCredit';
  }
  throw new Error(`Unsupported entry direction: ${(entry as { direction: string }).direction}`);
}

export function isSettledOnPosting(accountingType: AccountingType, paymentMethod: PaymentMethod): boolean {
  if (accountingType === 'Transfer') return true;
  if (accountingType === 'Sale' || accountingType === 'Expense' || accountingType === 'Receive' || accountingType === 'Pay' || accountingType === 'Owner') {
    return paymentMethod !== 'Credit';
  }
  return false;
}

export function buildInferredTransaction(entry: SimpleEntry, parts: Omit<InferredTransaction, 'notes'>): InferredTransaction {
  return { ...parts, notes: [] };
}
