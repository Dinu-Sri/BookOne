import { verifyPkce, type AuthorizationCode } from './oauth';

export type RedeemableCode = {
  code: string;
  tenantId: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scopes: string[] | string;
  connectionId: string | null;
  expiresAt: number;
  usedAt?: number | null;
};

export type RedeemDecision =
  | { action: 'issue'; consume: true }
  | { action: 'invalid_grant'; consume: false; description?: string }
  | { action: 'invalid_grant'; consume: true; description?: string };

export type RedeemBindings = {
  clientId: string;
  redirectUri: string;
  codeVerifier?: string;
  kind?: 'authorization_code' | 'refresh_token';
  now?: number;
};

/**
 * Exact redirect_uri match. 127.0.0.1 and localhost are different hosts.
 * Do not alias them.
 */
export function redirectUrisMatch(stored: string, presented: string): boolean {
  return stored === presented;
}

export function decideOauthCodeRedemption(row: RedeemableCode | null | undefined, args: RedeemBindings): RedeemDecision {
  if (!row) return { action: 'invalid_grant', consume: false };
  if (row.usedAt) return { action: 'invalid_grant', consume: false };
  if (row.clientId !== args.clientId) return { action: 'invalid_grant', consume: false };
  const kind = args.kind ?? 'authorization_code';
  if (kind === 'refresh_token') {
    if (row.codeChallenge !== 'refresh_token') return { action: 'invalid_grant', consume: false };
    if (row.expiresAt <= (args.now ?? Date.now())) {
      return { action: 'invalid_grant', consume: true, description: 'Refresh token expired.' };
    }
    return { action: 'issue', consume: true };
  }
  if (!redirectUrisMatch(row.redirectUri, args.redirectUri)) {
    return { action: 'invalid_grant', consume: false };
  }
  if (row.expiresAt <= (args.now ?? Date.now())) {
    return { action: 'invalid_grant', consume: true, description: 'Authorization code expired.' };
  }
  if (!verifyPkce(args.codeVerifier ?? '', row.codeChallenge, row.codeChallengeMethod)) {
    return { action: 'invalid_grant', consume: true, description: 'PKCE verification failed.' };
  }
  return { action: 'issue', consume: true };
}

export type MutableCodeStore = {
  get(code: string): RedeemableCode | AuthorizationCode | undefined | null;
  set(code: string, row: RedeemableCode | AuthorizationCode): void;
};

export type RedeemResult<T> =
  | { ok: true; row: T }
  | { ok: false; error: 'invalid_grant'; description?: string };

/**
 * Single-threaded atomic redeem: classify, then consume only when the decision says so.
 * Concurrent callers that do not await between get and set still serialize in JS.
 * Postgres redemption must use SELECT FOR UPDATE plus UPDATE … WHERE used_at IS NULL.
 */
export function redeemStoredCode<T extends RedeemableCode | AuthorizationCode>(
  store: MutableCodeStore,
  code: string,
  args: RedeemBindings,
): RedeemResult<T> {
  const current = (store.get(code) ?? null) as T | null;
  const snapshot: RedeemableCode | null = current
    ? {
        code: current.code,
        tenantId: current.tenantId,
        userId: current.userId,
        clientId: current.clientId,
        redirectUri: current.redirectUri,
        codeChallenge: current.codeChallenge,
        codeChallengeMethod: current.codeChallengeMethod,
        scopes: 'scopes' in current ? current.scopes : [],
        connectionId: current.connectionId ?? null,
        expiresAt: typeof current.expiresAt === 'number' ? current.expiresAt : Date.parse(String(current.expiresAt)),
        usedAt: current.usedAt ?? null,
      }
    : null;
  const decision = decideOauthCodeRedemption(snapshot, args);
  if (decision.consume && current && !current.usedAt) {
    const consumed = { ...current, usedAt: args.now ?? Date.now() };
    store.set(code, consumed);
    if (decision.action === 'issue') return { ok: true, row: consumed as T };
    return { ok: false, error: 'invalid_grant', description: decision.description };
  }
  if (decision.action === 'issue') {
    return { ok: false, error: 'invalid_grant' };
  }
  return { ok: false, error: 'invalid_grant', description: decision.description };
}

export async function redeemConcurrently<T>(
  tasks: Array<() => Promise<T>>,
): Promise<T[]> {
  return Promise.all(tasks.map((task) => task()));
}
