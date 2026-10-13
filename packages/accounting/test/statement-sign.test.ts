import { describe, expect, it } from 'vitest';
import { signedAccountBalance } from '../src/statement-sign';

describe('signedAccountBalance', () => {
  it('nets sales revenue minus sales returns', () => {
    expect(signedAccountBalance('revenue', 0, 600)).toBe(600);
    expect(signedAccountBalance('revenue', 100, 0)).toBe(-100);
    expect(signedAccountBalance('revenue', 0, 600) + signedAccountBalance('revenue', 100, 0)).toBe(500);
  });

  it('keeps cash and AR as debit-minus-credit assets', () => {
    expect(signedAccountBalance('asset', 250, 0)).toBe(250);
    expect(signedAccountBalance('asset', 600, 350)).toBe(250);
  });

  it('treats drawings as a reduction of equity', () => {
    expect(signedAccountBalance('equity', 0, 1000)).toBe(1000);
    expect(signedAccountBalance('equity', 100, 0)).toBe(-100);
  });
});
