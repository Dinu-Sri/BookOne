import { describe, expect, it } from 'vitest';
import { amountInWordsLkr, formatDateMmDdYyyy } from '../src/amount-in-words';

describe('amountInWordsLkr', () => {
  it('formats whole rupees', () => {
    expect(amountInWordsLkr(1500)).toBe('Rupees One Thousand Five Hundred only');
  });

  it('includes cents', () => {
    expect(amountInWordsLkr(10.5)).toBe('Rupees Ten and Cents Fifty only');
  });

  it('handles zero', () => {
    expect(amountInWordsLkr(0)).toBe('Rupees Zero only');
  });
});

describe('formatDateMmDdYyyy', () => {
  it('converts ISO to MM/DD/YYYY', () => {
    expect(formatDateMmDdYyyy('2026-07-17')).toBe('07/17/2026');
  });
});
