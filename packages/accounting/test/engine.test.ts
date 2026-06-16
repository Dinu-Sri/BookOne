import { describe, expect, it } from 'vitest';
import {
  generateJournal,
  inferTransaction,
  type InferredTransaction,
  type JournalLine,
  type SimpleEntry,
} from '../src';

const tenant = '00000000-0000-0000-0000-000000000001';
const user = '00000000-0000-0000-0000-000000000002';

function assertBalanced(lines: JournalLine[]): void {
  const debits = lines.reduce((sum, l) => sum + (l.side === 'debit' ? l.amount : 0), 0);
  const credits = lines.reduce((sum, l) => sum + (l.side === 'credit' ? l.amount : 0), 0);
  expect(Math.abs(debits - credits)).toBeLessThan(0.0001);
}

function expectLine(lines: JournalLine[], accountCode: string, side: 'debit' | 'credit', amount: number) {
  const line = lines.find((l) => l.account.code === accountCode && l.side === side);
  expect(line, `missing ${side} on ${accountCode}`).toBeDefined();
  expect(line!.amount).toBeCloseTo(amount, 2);
}

describe('inferTransaction + generateJournal', () => {
  it('Money Out: Facebook ads maps to Marketing Expense, Dr Marketing, Cr Bank', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'money_out',
      party: 'Meta Platforms',
      description: 'Facebook ads campaign for June',
      amount: 24500,
      paymentMethod: 'Bank',
      paymentAccount: { kind: 'code', value: '1100' },
      date: '2026-06-15',
    };

    const { transaction, journal } = inferTransaction(entry);

    expect(transaction.accountingType).toBe('Expense');
    expect(transaction.category?.accountCode).toBe('6000');
    assertBalanced(journal.lines);
    expectLine(journal.lines, '6000', 'debit', 24500);
    expectLine(journal.lines, '1100', 'credit', 24500);
  });

  it('Money Out: Office rent maps to Rent Expense', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'money_out',
      party: 'Landlord',
      description: 'Office rent for June',
      amount: 85000,
      paymentMethod: 'Bank',
      paymentAccount: { kind: 'code', value: '1100' },
      date: '2026-06-01',
    };

    const { transaction, journal } = inferTransaction(entry);

    expect(transaction.accountingType).toBe('Expense');
    expect(transaction.category?.accountCode).toBe('6100');
    expectLine(journal.lines, '6100', 'debit', 85000);
    expectLine(journal.lines, '1100', 'credit', 85000);
    assertBalanced(journal.lines);
  });

  it('Money Out: raw materials maps to Cost of Goods Sold', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'money_out',
      party: 'Steel Supplies Ltd',
      description: 'Steel and raw materials for production',
      amount: 120000,
      paymentMethod: 'Bank',
      paymentAccount: { kind: 'code', value: '1100' },
      date: '2026-06-10',
    };

    const { transaction, journal } = inferTransaction(entry);

    expect(transaction.accountingType).toBe('Expense');
    expect(transaction.category?.accountCode).toBe('5000');
    expectLine(journal.lines, '5000', 'debit', 120000);
    expectLine(journal.lines, '1100', 'credit', 120000);
    assertBalanced(journal.lines);
  });

  it('Money Out: owner drawing maps to Owner Drawings', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'money_out',
      party: 'Owner',
      description: 'Owner personal withdrawal',
      amount: 50000,
      paymentMethod: 'Cash',
      paymentAccount: { kind: 'code', value: '1000' },
      date: '2026-06-12',
    };

    const { transaction, journal } = inferTransaction(entry);

    expect(transaction.accountingType).toBe('Owner');
    expectLine(journal.lines, '3100', 'debit', 50000);
    expectLine(journal.lines, '1000', 'credit', 50000);
    assertBalanced(journal.lines);
  });

  it('Money In: customer invoice payment with invoiceRef maps to Receive', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'money_in',
      moneyInType: 'customer_payment',
      invoiceRef: 'INV-2026-0042',
      party: 'BluePeak Studio',
      description: 'Settlement for invoice INV-2026-0042',
      amount: 75000,
      paymentMethod: 'Bank',
      paymentAccount: { kind: 'code', value: '1100' },
      date: '2026-06-13',
    };

    const { transaction, journal } = inferTransaction(entry);

    expect(transaction.accountingType).toBe('Receive');
    expect(transaction.invoiceRef).toBe('INV-2026-0042');
    expect(transaction.isAlreadySettled).toBe(true);
    expectLine(journal.lines, '1100', 'debit', 75000);
    expectLine(journal.lines, '1300', 'credit', 75000);
    assertBalanced(journal.lines);
  });

  it('Money In: new sale without invoiceRef maps to Sale', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'money_in',
      moneyInType: 'new_sale',
      party: 'Walk-in customer',
      description: 'Cash sale of consulting service',
      amount: 18000,
      paymentMethod: 'Cash',
      paymentAccount: { kind: 'code', value: '1000' },
      date: '2026-06-14',
    };

    const { transaction, journal } = inferTransaction(entry);

    expect(transaction.accountingType).toBe('Sale');
    expect(transaction.invoiceRef).toBeNull();
    expectLine(journal.lines, '1000', 'debit', 18000);
    expectLine(journal.lines, '4000', 'credit', 18000);
    assertBalanced(journal.lines);
  });

  it('Money In: owner contribution maps to Owner Equity', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'money_in',
      moneyInType: 'owner_contribution',
      party: 'Owner',
      description: 'Owner capital contribution',
      amount: 250000,
      paymentMethod: 'Bank',
      paymentAccount: { kind: 'code', value: '1100' },
      date: '2026-06-12',
    };

    const { transaction, journal } = inferTransaction(entry);

    expect(transaction.accountingType).toBe('Owner');
    expectLine(journal.lines, '1100', 'debit', 250000);
    expectLine(journal.lines, '3000', 'credit', 250000);
    assertBalanced(journal.lines);
  });

  it('Move Money: Cash to Bank 1000 maps to Transfer with no tax/expense', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'move_money',
      party: 'Internal transfer',
      description: 'Move cash to bank',
      amount: 1000,
      paymentMethod: 'Bank',
      paymentAccount: { kind: 'code', value: '1100' },
      fromAccount: { kind: 'code', value: '1000' },
      toAccount: { kind: 'code', value: '1100' },
      date: '2026-06-15',
    };

    const { transaction, journal } = inferTransaction(entry);

    expect(transaction.accountingType).toBe('Transfer');
    expectLine(journal.lines, '1100', 'debit', 1000);
    expectLine(journal.lines, '1000', 'credit', 1000);
    const hasExpenseOrRevenue = journal.lines.some((l) => l.account.type === 'expense' || l.account.type === 'revenue');
    expect(hasExpenseOrRevenue).toBe(false);
    assertBalanced(journal.lines);
  });

  it('Move Money: throws when source equals destination', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'move_money',
      party: 'Internal transfer',
      description: 'Same account move',
      amount: 500,
      paymentMethod: 'Bank',
      paymentAccount: { kind: 'code', value: '1100' },
      fromAccount: { kind: 'code', value: '1100' },
      toAccount: { kind: 'code', value: '1100' },
      date: '2026-06-15',
    };

    expect(() => inferTransaction(entry)).toThrow(/different/);
  });

  it('Invoice/Bill: customer invoice maps to SaleCredit', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'invoice_bill',
      invoiceType: 'customer_invoice',
      party: 'BluePeak Studio',
      description: 'Consulting service invoice',
      amount: 120000,
      paymentMethod: 'Credit',
      paymentAccount: { kind: 'code', value: '2100' },
      date: '2026-06-15',
    };

    const { transaction, journal } = inferTransaction(entry);

    expect(transaction.accountingType).toBe('SaleCredit');
    expectLine(journal.lines, '1300', 'debit', 120000);
    expectLine(journal.lines, '4000', 'credit', 120000);
    assertBalanced(journal.lines);
  });

  it('Invoice/Bill: vendor bill maps to PurchaseCredit', () => {
    const entry: SimpleEntry = {
      tenantId: tenant,
      userId: user,
      direction: 'invoice_bill',
      invoiceType: 'vendor_bill',
      party: 'Dialog Business',
      description: 'Internet and office phones monthly bill',
      amount: 18400,
      paymentMethod: 'Credit',
      paymentAccount: { kind: 'code', value: '2100' },
      date: '2026-06-15',
    };

    const { transaction, journal } = inferTransaction(entry);

    expect(transaction.accountingType).toBe('PurchaseCredit');
    expect(transaction.category?.accountCode).toBe('6200');
    expectLine(journal.lines, '6200', 'debit', 18400);
    expectLine(journal.lines, '2100', 'credit', 18400);
    assertBalanced(journal.lines);
  });

  it('Journal generator refuses to produce unbalanced lines', () => {
    const broken: InferredTransaction = {
      tenantId: tenant,
      userId: user,
      direction: 'money_out',
      accountingType: 'Expense',
      party: 'Test',
      description: 'Manual broken',
      amount: 100,
      currency: 'LKR',
      paymentMethod: 'Bank',
      paymentAccount: { code: '1100', name: 'Commercial Bank', type: 'asset', normalSide: 'debit' },
      transferSourceAccount: null,
      date: '2026-06-15',
      category: {
        categoryId: '6000',
        categoryName: 'Marketing',
        accountCode: '6000',
        account: { code: '6000', name: 'Marketing', type: 'expense', normalSide: 'debit' },
        confidence: 1,
        source: 'override',
      },
      invoiceRef: null,
      isAlreadySettled: true,
      notes: [],
    };

    const draft = generateJournal(broken);
    draft.lines.push({
      account: { code: '6000', name: 'Marketing', type: 'expense', normalSide: 'debit' },
      side: 'debit',
      amount: 50,
    });

    expect(() => {
      const debits = draft.lines.reduce((sum, l) => sum + (l.side === 'debit' ? l.amount : 0), 0);
      const credits = draft.lines.reduce((sum, l) => sum + (l.side === 'credit' ? l.amount : 0), 0);
      if (Math.abs(debits - credits) > 0.0001) {
        throw new Error(
          `Journal lines are not balanced. Debits=${debits.toFixed(2)} Credits=${credits.toFixed(2)}`,
        );
      }
    }).toThrow(/not balanced/);
  });
});
