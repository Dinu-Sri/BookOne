import { describe, expect, it } from 'vitest';
import {
  classifyFromCode,
  isCardClearingCode,
  isCashUniverseCode,
  isSpendableCashCode,
  nextSuggestedCode,
  wizardTemplate,
} from '../src/account-classification';

describe('account classification', () => {
  it('maps seeded cash, bank and card accounts', () => {
    expect(classifyFromCode('1000').liquidity).toBe('cash');
    expect(classifyFromCode('1100').subtype).toBe('bank');
    expect(classifyFromCode('1200').subtype).toBe('card_clearing');
    expect(classifyFromCode('1300').controlRole).toBe('ar');
    expect(classifyFromCode('2410').subtype).toBe('customer_advance');
    expect(classifyFromCode('1350').subtype).toBe('supplier_advance');
    expect(classifyFromCode('1360').subtype).toBe('staff_advance');
  });

  it('classifies custom 1101–1199 as banks without a hardcoded list', () => {
    const bank = classifyFromCode('1101', 'asset', 'debit');
    expect(bank.subtype).toBe('bank');
    expect(bank.liquidity).toBe('bank');
    expect(isSpendableCashCode('1101')).toBe(true);
    expect(isSpendableCashCode('1001')).toBe(true);
    expect(isCashUniverseCode('1101')).toBe(true);
    expect(isCardClearingCode('1101')).toBe(false);
  });

  it('does not treat AR or income as spendable cash', () => {
    expect(isSpendableCashCode('1300')).toBe(false);
    expect(isSpendableCashCode('4000')).toBe(false);
    expect(isCashUniverseCode('2100')).toBe(false);
  });

  it('suggests the next free bank code', () => {
    expect(nextSuggestedCode({ from: 1101, to: 1199 }, ['1101', '1102'])).toBe('1103');
    expect(wizardTemplate('bank')?.statement).toMatch(/cash and bank/i);
  });
});
