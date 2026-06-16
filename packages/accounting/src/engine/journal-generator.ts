import { requireAccount } from '../account-lookup';
import type { InferredTransaction, JournalDraft, JournalLine } from '../inference/types';

function assertBalanced(lines: JournalLine[]): void {
  const debits = lines.reduce((sum, line) => sum + (line.side === 'debit' ? line.amount : 0), 0);
  const credits = lines.reduce((sum, line) => sum + (line.side === 'credit' ? line.amount : 0), 0);
  if (Math.abs(debits - credits) > 0.0001) {
    throw new Error(
      `Journal lines are not balanced. Debits=${debits.toFixed(2)} Credits=${credits.toFixed(2)}`,
    );
  }
}

function money(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function generateJournal(transaction: InferredTransaction): JournalDraft {
  const { accountingType, amount, paymentAccount, category, description } = transaction;
  const lines: JournalLine[] = [];
  const memo = `${accountingType}: ${description}`.trim();

  if (accountingType === 'Transfer') {
    const from = transaction.transferSourceAccount;
    const to = paymentAccount;
    if (!from) {
      throw new Error('Transfer journal requires a source account on the transaction.');
    }
    if (from.code === to.code) {
      throw new Error('Transfer source and destination accounts must be different.');
    }
    lines.push({ account: to, side: 'debit', amount: money(amount), memo: 'Transfer destination' });
    lines.push({ account: from, side: 'credit', amount: money(amount), memo: 'Transfer source' });
    assertBalanced(lines);
    return { lines, memo };
  }

  if (accountingType === 'Sale') {
    lines.push({ account: paymentAccount, side: 'debit', amount: money(amount), memo: 'Cash/Bank received' });
    lines.push({ account: requireAccount('4000'), side: 'credit', amount: money(amount), memo: 'Sales revenue' });
  } else if (accountingType === 'SaleCredit') {
    lines.push({ account: requireAccount('1300'), side: 'debit', amount: money(amount), memo: 'Customer invoice' });
    lines.push({ account: requireAccount('4000'), side: 'credit', amount: money(amount), memo: 'Sales revenue' });
  } else if (accountingType === 'Expense') {
    if (!category) {
      throw new Error('Expense journal requires an inferred category.');
    }
    lines.push({ account: category.account, side: 'debit', amount: money(amount), memo: category.categoryName });
    lines.push({ account: paymentAccount, side: 'credit', amount: money(amount), memo: 'Payment' });
  } else if (accountingType === 'Purchase') {
    if (!category) {
      throw new Error('Purchase journal requires an inferred category.');
    }
    lines.push({ account: category.account, side: 'debit', amount: money(amount), memo: category.categoryName });
    lines.push({ account: paymentAccount, side: 'credit', amount: money(amount), memo: 'Payment' });
  } else if (accountingType === 'PurchaseCredit') {
    if (!category) {
      throw new Error('Purchase journal requires an inferred category.');
    }
    lines.push({ account: category.account, side: 'debit', amount: money(amount), memo: category.categoryName });
    lines.push({ account: requireAccount('2100'), side: 'credit', amount: money(amount), memo: 'Vendor bill' });
  } else if (accountingType === 'Receive') {
    lines.push({ account: paymentAccount, side: 'debit', amount: money(amount), memo: 'Customer payment received' });
    lines.push({ account: requireAccount('1300'), side: 'credit', amount: money(amount), memo: 'Receivable settled' });
  } else if (accountingType === 'Pay') {
    lines.push({ account: requireAccount('2100'), side: 'debit', amount: money(amount), memo: 'Payable settled' });
    lines.push({ account: paymentAccount, side: 'credit', amount: money(amount), memo: 'Payment' });
  } else if (accountingType === 'Owner') {
    if (transaction.direction === 'money_in') {
      lines.push({ account: paymentAccount, side: 'debit', amount: money(amount), memo: 'Owner contribution' });
      lines.push({ account: requireAccount('3000'), side: 'credit', amount: money(amount), memo: 'Owner equity' });
    } else {
      lines.push({ account: requireAccount('3100'), side: 'debit', amount: money(amount), memo: 'Owner drawing' });
      lines.push({ account: paymentAccount, side: 'credit', amount: money(amount), memo: 'Cash/Bank' });
    }
  } else {
    throw new Error(`Unsupported accounting type: ${accountingType}`);
  }

  assertBalanced(lines);
  return { lines, memo };
}
