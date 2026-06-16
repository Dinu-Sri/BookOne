import type { Account } from '../chart-of-accounts';

export type EntryDirection = 'money_in' | 'money_out' | 'move_money' | 'invoice_bill';

export type MoneyInType = 'customer_payment' | 'new_sale' | 'owner_contribution';

export type InvoiceType = 'customer_invoice' | 'vendor_bill';

export type PaymentMethod = 'Cash' | 'Bank' | 'Card' | 'Online' | 'Credit';

export type AccountRefKind = 'code' | 'subType';

export interface AccountRef {
  kind: AccountRefKind;
  value: string;
}

export interface MoneyInExtras {
  moneyInType: MoneyInType;
  invoiceRef?: string;
}

export interface MoneyOutExtras {
  categoryOverride?: string;
}

export interface MoveMoneyExtras {
  fromAccount: AccountRef;
  toAccount: AccountRef;
}

export interface InvoiceBillExtras {
  invoiceType: InvoiceType;
  dueDate?: string;
}

export interface BaseSimpleEntry {
  tenantId: string;
  userId: string;
  party: string;
  description: string;
  amount: number;
  currency?: string;
  paymentMethod: PaymentMethod;
  paymentAccount: AccountRef;
  date: string;
  receiptRef?: string;
}

export type SimpleEntry = BaseSimpleEntry &
  (
    | ({ direction: 'money_in' } & MoneyInExtras)
    | ({ direction: 'money_out' } & MoneyOutExtras)
    | ({ direction: 'move_money' } & MoveMoneyExtras)
    | ({ direction: 'invoice_bill' } & InvoiceBillExtras)
  );

export type AccountingType =
  | 'Sale'
  | 'SaleCredit'
  | 'Purchase'
  | 'PurchaseCredit'
  | 'Expense'
  | 'Receive'
  | 'Pay'
  | 'Transfer'
  | 'Owner';

export interface CategoryInference {
  categoryId: string;
  categoryName: string;
  accountCode: string;
  account: Account;
  confidence: number;
  source: 'rule' | 'default' | 'override';
}

export interface InferredTransaction {
  tenantId: string;
  userId: string;
  direction: EntryDirection;
  accountingType: AccountingType;
  party: string;
  description: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentAccount: Account;
  transferSourceAccount: Account | null;
  date: string;
  receiptRef?: string;
  category: CategoryInference | null;
  invoiceRef: string | null;
  isAlreadySettled: boolean;
  notes: string[];
}

export interface JournalLine {
  account: Account;
  side: 'debit' | 'credit';
  amount: number;
  memo?: string;
}

export interface JournalDraft {
  lines: JournalLine[];
  memo: string;
}
