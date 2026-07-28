import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStatementFile, previewStatementSheet } from '../src/parse';
import { signedFromAmountAndType, parseAmountCell } from '../src/normalize';

const SAMPATH = 'C:/Users/dinus/Downloads/Statement.xlsx';
const HNB = 'C:/Users/dinus/Downloads/42504_SRReport_1785226727445.xls';

describe('signedFromAmountAndType (Sampath DR/CR)', () => {
  it('C is money in', () => {
    expect(signedFromAmountAndType('5,000.00', 'C')).toBe(5000);
  });
  it('D is money out even if amount already negative', () => {
    expect(signedFromAmountAndType('-5,000.00', 'D')).toBe(-5000);
    expect(signedFromAmountAndType('5,000.00', 'D')).toBe(-5000);
  });
  it('dash amount is zero', () => {
    expect(parseAmountCell('-')).toBe(0);
  });
});

describe.runIf(existsSync(SAMPATH))('Sampath Vishwa Statement.xlsx', () => {
  it('detects amount_with_type and parses credits/debits', () => {
    const buf = readFileSync(SAMPATH);
    const prev = previewStatementSheet(buf, 'Statement.xlsx');
    expect(prev.suggested.signConvention).toBe('amount_with_type');
    expect(prev.suggested.columnMap.type).toBeDefined();
    expect(prev.suggested.columnMap.amount).toBeDefined();

    const parsed = parseStatementFile(buf, 'Statement.xlsx', {
      tenantId: 't1',
      bankAccountId: 'b1',
      profile: prev.suggested,
    });
    expect(parsed.lines.length).toBeGreaterThan(10);
    // First sample line from file: CEFT credit 5000 in
    const first = parsed.lines.find((l) => l.description.includes('CEFT - credit card bill'));
    expect(first).toBeTruthy();
    expect(first!.amountSigned).toBe(5000);
    // A debit line
    const debit = parsed.lines.find((l) => l.description.startsWith('SVR-'));
    expect(debit).toBeTruthy();
    expect(debit!.amountSigned).toBeLessThan(0);
    // No absurd 7-digit blowups from comma mishandling on 5,000
    for (const l of parsed.lines.slice(0, 20)) {
      expect(Math.abs(l.amountSigned)).toBeLessThan(1_000_000);
    }
  });
});

describe.runIf(existsSync(HNB))('HNB-style SRReport xls', () => {
  it('detects debit/credit columns and parses', () => {
    const buf = readFileSync(HNB);
    const prev = previewStatementSheet(buf, 'report.xls');
    expect(prev.suggested.signConvention).toBe('debit_credit');
    expect(prev.suggested.columnMap.debit).toBeDefined();
    expect(prev.suggested.columnMap.credit).toBeDefined();

    const parsed = parseStatementFile(buf, 'report.xls', {
      tenantId: 't1',
      bankAccountId: 'b1',
      profile: prev.suggested,
    });
    expect(parsed.lines.length).toBeGreaterThan(50);
    // ATM cash withdrawal 42,030 out
    const atm = parsed.lines.find((l) => l.description.includes('ATMCASHWDL'));
    expect(atm).toBeTruthy();
    expect(atm!.amountSigned).toBe(-42030);
    // Credit in 7000
    const funeral = parsed.lines.find((l) => l.description.toLowerCase().includes('funeral'));
    expect(funeral).toBeTruthy();
    expect(funeral!.amountSigned).toBe(7000);
  });
});
