/** Labels and eligibility for recon create posting accounts. */

export type PostingAccount = {
  code: string;
  name: string;
  type: string;
  isActive?: string | null;
  isGroup?: string | null;
};

export function postingAccountLabel(account: { code: string; name: string }): string {
  const name = account.name.trim() || account.code;
  return `${account.code} · ${name}`;
}

export function isEligiblePostingAccount(account: PostingAccount, side: 'in' | 'out'): boolean {
  if (account.isActive === '0' || account.isGroup === '1') return false;
  if (side === 'out') return account.type === 'expense';
  return account.type === 'revenue';
}

export function eligiblePostingAccounts(accounts: PostingAccount[], side: 'in' | 'out'): PostingAccount[] {
  return accounts.filter((a) => isEligiblePostingAccount(a, side));
}

export function pickDefaultPostingCode(accounts: { code: string }[], preferred: string): string {
  if (accounts.some((a) => a.code === preferred)) return preferred;
  return accounts[0]?.code ?? '';
}
