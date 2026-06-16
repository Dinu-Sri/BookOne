import { ACCOUNTS_BY_CODE, DEFAULT_CHART_OF_ACCOUNTS, type Account, type AccountType } from '../chart-of-accounts';
import type { AccountRef, PaymentMethod } from './types';

const PAYMENT_ACCOUNT_BY_METHOD: Record<PaymentMethod, string> = {
  Cash: '1000',
  Bank: '1100',
  Card: '1200',
  Online: '1100',
  Credit: '2100',
};

export function resolveAccount(ref: AccountRef): Account {
  if (ref.kind === 'code') {
    const account = ACCOUNTS_BY_CODE[ref.value];
    if (!account) {
      throw new Error(`Unknown account code in resolver: ${ref.value}`);
    }
    return account;
  }

  const matches = DEFAULT_CHART_OF_ACCOUNTS.filter((a) => a.code.startsWith(ref.value));
  if (matches.length === 1) {
    const [first] = matches;
    if (first) {
      return first;
    }
  }
  if (matches.length === 0) {
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
