import { ACCOUNTS_BY_CODE, type Account } from './chart-of-accounts';

export function requireAccount(code: string): Account {
  const account = ACCOUNTS_BY_CODE[code];
  if (!account) {
    throw new Error(`Chart of accounts is missing required account: ${code}`);
  }
  return account;
}
