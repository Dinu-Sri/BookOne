import { describe, expect, it } from 'vitest';
import { inferCategory } from '../src/inference/category-inferrer';

const out = (d: string, dir: 'money_in' | 'money_out' = 'money_out', kind: string | null = 'company') => inferCategory(d, '', dir, undefined, kind);

describe('category rules for everyday and bank-statement wording', () => {
  it('plural salaries is still salaries', () => {
    expect(out('Staff salaries October')).toMatchObject({ accountCode: '6300', confidence: 0.9 });
    expect(out('SALARY BULK TRANSFER OCT')).toMatchObject({ accountCode: '6300' });
  });

  it('bank statement fee lines are Bank Charges on a company chart', () => {
    expect(out('SERVICE CHARGES OCT')).toMatchObject({ accountCode: '6600' });
    expect(out('SMS ALERT CHARGES')).toMatchObject({ accountCode: '6600' });
    expect(out('CHEQUE BOOK ISSUE')).toMatchObject({ accountCode: '6600' });
  });

  it('household charts never send bank fees to the shared 6600 code (Education there)', () => {
    expect(out('SMS ALERT CHARGES', 'money_out', 'personal').accountCode).toBe('6800');
  });

  it('insurance and interest received', () => {
    expect(out('STANDING ORDER AIA INSURANCE')).toMatchObject({ accountCode: '6700' });
    expect(out('INTEREST CREDIT', 'money_in')).toMatchObject({ accountCode: '4300', confidence: 0.9 });
  });
});
