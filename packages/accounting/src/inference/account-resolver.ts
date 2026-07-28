import { ACCOUNTS_BY_CODE, DEFAULT_CHART_OF_ACCOUNTS, type Account, type AccountType } from '../chart-of-accounts';
import type { AccountRef, PaymentMethod } from './types';

const PAYMENT_ACCOUNT_BY_METHOD: Record<PaymentMethod, string> = {
  Cash: '1000',
  Bank: '1100',
  Card: '1200',
  Online: '1100',
  Credit: '2100',
};

/**
 * Tenant-created liquid accounts (cashbook multi-bank) live in 1101–1199 / 1201–1299
 * and are not on the static seed CoA. Resolve them as bank/card asset shells so the
 * journal engine can post; recordEntry still binds the real DB account by code.
 */
function dynamicLiquidAccount(code: string): Account | null {
  if (/^11\d{2}$/.test(code)) {
    return {
      code,
      name: code === '1100' ? 'Bank Account' : `Bank ${code}`,
      type: 'asset',
      normalSide: 'debit',
    };
  }
  if (/^12\d{2}$/.test(code)) {
    return {
      code,
      name: code === '1200' ? 'Card Clearing' : `Card ${code}`,
      type: 'asset',
      normalSide: 'debit',
    };
  }
  if (code === '1000') {
    return { code: '1000', name: 'Cash on Hand', type: 'asset', normalSide: 'debit' };
  }
  return null;
}

export function resolveAccount(ref: AccountRef): Account {
  if (ref.kind === 'code') {
    const account = ACCOUNTS_BY_CODE[ref.value];
    if (account) return account;
    const dynamic = dynamicLiquidAccount(ref.value);
    if (dynamic) return dynamic;
    throw new Error(`Unknown account code in resolver: ${ref.value}`);
  }

  const matches = DEFAULT_CHART_OF_ACCOUNTS.filter((a) => a.code.startsWith(ref.value));
  if (matches.length === 1) {
    const [first] = matches;
    if (first) {
      return first;
    }
  }
  if (matches.length === 0) {
    // Allow subType-style "11" to mean bank family for move money, etc.
    if (ref.value === '11' || ref.value === '1100') {
      return dynamicLiquidAccount('1100')!;
    }
    throw new Error(`No account matches subType prefix: ${ref.value}`);
  }
  throw new Error(`SubType prefix ${ref.value} matches multiple accounts; please specify a code.`);
}

export function accountForPaymentMethod(method: PaymentMethod): Account {
  const code = PAYMENT_ACCOUNT_BY_METHOD[method];
  const account = ACCOUNTS_BY_CODE[code];
  if (!account) {
    throw new Error(`Chart of accounts missing payment account for method ${method}.`);
  }
  return account;
}

export function isAccountType(account: Account, type: AccountType): boolean {
  return account.type === type;
}
