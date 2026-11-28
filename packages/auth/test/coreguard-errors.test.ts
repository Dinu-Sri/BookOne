import { describe, expect, it } from 'vitest';
import {
  COREGUARD_GENERIC_MESSAGE,
  COREGUARD_USER_MESSAGES,
  coreguardErrorInfo,
} from '../../../apps/web/src/lib/coreguard-error-map';

// CoreGuard error contract (guide §4.4): users see plain messages, never SQL.
describe('CoreGuard error messages', () => {
  it('maps every guard code to the message in the guide', () => {
    expect(COREGUARD_USER_MESSAGES).toEqual({
      G01: "This entry doesn't balance, so nothing was saved.",
      G02: 'An amount, date or side in this entry is not valid, so nothing was saved.',
      G03: "This entry refers to an account or contact that can't be used here.",
      G04: "Posted entries can't be changed. Post a reversal instead.",
      G05: 'This month is closed. Reopen it (with a reason) or use an open date.',
      G06: 'An amount, date or side in this entry is not valid, so nothing was saved.',
      G07: 'This entry could not be saved completely, so nothing was saved. Please try again.',
      G09: 'This entry could not be saved completely, so nothing was saved. Please try again.',
      G10: 'Choose the customer, supplier or staff member for this entry.',
      G11: 'This payment is from a different party than the invoice. Record it as a third-party payment with a reason and reference.',
    });
    expect(COREGUARD_GENERIC_MESSAGE).toBe(
      'Nothing was saved because the books would have become inconsistent. The error has been logged.',
    );
  });

  it('recognises a guard error and keeps the original for the log only', () => {
    const err = Object.assign(new Error('COREGUARD G05: period 2026-01 is locked'), { code: '23514' });
    const info = coreguardErrorInfo(err);
    expect(info?.code).toBe('G05');
    expect(info?.userMessage).toBe(COREGUARD_USER_MESSAGES.G05);
    expect(info?.original).toContain('period 2026-01 is locked');
    expect(info?.userMessage).not.toMatch(/COREGUARD|period_locks|SQL/);
  });

  it('finds the guard error in a wrapped cause (drizzle wraps driver errors)', () => {
    const cause = new Error('COREGUARD G01: journal entry x does not balance (difference 0.01, 1 debit lines, 1 credit lines, 0 invalid lines)');
    const wrapped = new Error('Failed query: insert into "journal_lines" ...', { cause });
    expect(coreguardErrorInfo(wrapped)?.code).toBe('G01');
  });

  it('uses the generic message for unknown CoreGuard codes and CoreGuard unique indexes', () => {
    expect(coreguardErrorInfo(new Error('COREGUARD G99: something new'))?.userMessage).toBe(COREGUARD_GENERIC_MESSAGE);
    expect(coreguardErrorInfo(new Error('COREGUARD: operation key required'))?.userMessage).toBe(COREGUARD_GENERIC_MESSAGE);
    expect(
      coreguardErrorInfo(new Error('duplicate key value violates unique constraint "cg_one_live_entry_per_tx"'))?.code,
    ).toBe('INDEX');
  });

  it('leaves other errors alone', () => {
    expect(coreguardErrorInfo(new Error('SKU already exists.'))).toBeNull();
    expect(coreguardErrorInfo(new Error('duplicate key value violates unique constraint "accounts_code_uidx"'))).toBeNull();
  });
});
