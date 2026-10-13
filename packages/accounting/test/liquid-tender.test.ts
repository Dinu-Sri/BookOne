import { describe, expect, it } from 'vitest';
import { isLiquidTenderCode } from '../src/inference/account-resolver';

describe('isLiquidTenderCode', () => {
  it('accepts cash, default bank/card, and custom 11xx/12xx accounts', () => {
    expect(['1000', '1100', '1200', '1101', '1199', '1201', '1299'].every(isLiquidTenderCode)).toBe(true);
  });

  it('rejects revenue, control, expense, and out-of-family codes', () => {
    expect(['4000', '1300', '2100', '6800', '4300', '11', '12', '1001', '1301'].some(isLiquidTenderCode)).toBe(
      false,
    );
  });
});
