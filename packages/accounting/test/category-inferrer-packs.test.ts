import { describe, expect, it } from 'vitest';
import {
  CATEGORY_RULES,
  chartOfAccountsForEntity,
  inferCategory,
  inferTransaction,
} from '../src';

const out = (description: string, kind?: string) => inferCategory(description, '', 'money_out', undefined, kind);

describe('category inference follows the workspace chart', () => {
  it('company keeps the existing company mappings', () => {
    expect(out('office supplies', 'company')).toMatchObject({ accountCode: '6500', categoryName: 'Office Supplies Expense' });
    expect(out('staff salary', 'company')).toMatchObject({ accountCode: '6300', categoryName: 'Salaries Expense' });
    expect(out('bank charges', 'company')).toMatchObject({ accountCode: '6600', categoryName: 'Bank Charges' });
    // No kind = company, as before.
    expect(out('office supplies')).toMatchObject({ accountCode: '6500', categoryName: 'Office Supplies Expense' });
  });

  it.each(['personal', 'pending', 'sole_prop'])('%s never maps business costs onto household accounts', (kind) => {
    for (const d of ['office supplies', 'printer paper stationery', 'staff salary', 'bank charges']) {
      const cat = out(d, kind);
      expect(cat.accountCode, d).toBe('6800');
      expect(cat.categoryName, d).toBe('General Expense');
    }
  });

  it('personal recognises household spending on its own codes', () => {
    expect(out('groceries at supermarket', 'personal')).toMatchObject({ accountCode: '6300', categoryName: 'Food & Household' });
    expect(out('pharmacy medicine', 'personal')).toMatchObject({ accountCode: '6500', categoryName: 'Healthcare' });
    expect(out('school tuition', 'personal')).toMatchObject({ accountCode: '6600', categoryName: 'Education' });
    expect(out('house rent', 'personal')).toMatchObject({ accountCode: '6100', categoryName: 'Rent & Housing' });
    expect(out('bus fare transport', 'personal')).toMatchObject({ accountCode: '6400', categoryName: 'Transport' });
  });

  it('household words do not fire for a company', () => {
    expect(out('groceries', 'company').accountCode).toBe('6800');
    expect(out('pharmacy', 'company').accountCode).toBe('6800');
  });

  it('personal never suggests an account its chart lacks', () => {
    const codes = new Set(chartOfAccountsForEntity('personal').map((a) => a.code));
    for (const d of ['facebook ads', 'raw material', 'inventory stock', 'product sale']) {
      expect(codes.has(out(d, 'personal').accountCode), d).toBe(true);
    }
    expect(inferCategory('product sale', '', 'money_in', undefined, 'personal').accountCode).toBe('4300');
  });

  it('sole prop keeps its business add-on accounts', () => {
    expect(out('facebook ads', 'sole_prop')).toMatchObject({ accountCode: '6000', categoryName: 'Marketing Expense' });
    expect(out('raw material', 'sole_prop').accountCode).toBe('5000');
  });

  it('every pack-scoped rule targets a code its chart has', () => {
    for (const rule of CATEGORY_RULES) {
      for (const pack of rule.packs ?? []) {
        const codes = chartOfAccountsForEntity(pack).map((a) => a.code);
        expect(codes, `${rule.accountCode} in ${pack}`).toContain(rule.accountCode);
      }
    }
  });

  it('the posting engine debits General Expense for personal office supplies', () => {
    const { journal } = inferTransaction({
      tenantId: 't',
      userId: 'u',
      entityKind: 'personal',
      direction: 'money_out',
      party: 'Stationery shop',
      description: 'office supplies',
      amount: 1500,
      paymentMethod: 'Cash',
      paymentAccount: { kind: 'code', value: '1000' },
      date: '2026-11-26',
    } as Parameters<typeof inferTransaction>[0]);
    const debit = journal.lines.find((l) => l.side === 'debit');
    expect(debit?.account.code).toBe('6800');
  });
});
