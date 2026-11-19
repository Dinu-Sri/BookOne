import { randomUUID } from 'node:crypto';
import { tenantIdFromBoundToken, verifyPkce, type AuthorizationCode } from './oauth';

const TENANT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  requestId?: string | null;
};

export type OauthRedeemReason =
  | 'issued'
  | 'code_issued'
  | 'missing_tenant_binding'
  | 'row_missing_or_rls_hidden'
  | 'used_code'
  | 'client_mismatch'
  | 'redirect_mismatch'
  | 'expired'
  | 'pkce_mismatch'
  | 'refresh_mismatch'
  | 'concurrent_consume';

export type RedeemDecision =
  | { action: 'issue'; consume: true; reason: 'issued' }
  | { action: 'invalid_grant'; consume: false; reason: OauthRedeemReason; description?: string }
  | { action: 'invalid_grant'; consume: true; reason: OauthRedeemReason; description?: string };

export type RedeemBindings = {
  clientId: string;
  redirectUri: string;
  codeVerifier?: string;
  kind?: 'authorization_code' | 'refresh_token';
  now?: number;
};

export type OauthRedirectComparison = {
  storedHost: string | null;
  presentedHost: string | null;
  storedPort: string | null;
  presentedPort: string | null;
  hostsEqual: boolean;
  portsEqual: boolean;
  pathsEqual: boolean;
  schemesEqual: boolean;
  exactEqual: boolean;
};

export type OauthTenantResolution = {
  tenantId: string | null;
  boundPresent: boolean;
  hintPresent: boolean;
  usedBoundTenant: boolean;
  usedHint: boolean;
  hintMatchesBound: boolean | null;
};

export type OauthRedeemFlags = {
  boundPresent: boolean;
  hintPresent: boolean;
  usedBoundTenant: boolean;
  usedHint: boolean;
  hintMatchesBound: boolean | null;
  rowFound: boolean;
  consumed: boolean;
  clientMatches: boolean | null;
  tenantGucPresent: boolean | null;
  tenantGucMatches: boolean | null;
  tenantGucResetInTransaction: boolean | null;
  hostsEqual: boolean | null;
  portsEqual: boolean | null;
  pathsEqual: boolean | null;
  schemesEqual: boolean | null;
  exactRedirectEqual: boolean | null;
  storedHost: string | null;
  presentedHost: string | null;
  storedPort: string | null;
  presentedPort: string | null;
  codeLength: number;
  verifierPresent: boolean;
  challengeMethod: string | null;
};

export type SanitizedOauthRedeemDiagnostic = {
  requestId: string;
  reason: OauthRedeemReason;
  at: string;
  flags: OauthRedeemFlags;
};

/**
 * Exact redirect_uri match. 127.0.0.1 and localhost are different hosts.
 * Do not alias them.
 */
export function redirectUrisMatch(stored: string, presented: string): boolean {
  return stored === presented;
}

export function newOauthRequestId(): string {
  return randomUUID();
}

export function asTenantUuid(value: string | null | undefined): string | null {
  const id = typeof value === 'string' ? value.trim() : '';
  return TENANT_UUID.test(id) ? id : null;
}

/**
 * Tenant-bound codes win. `tenant_id` / AGENT_BRIDGE_OAUTH_TENANT_HINT are
 * fallbacks only when the presented value is not tenant-bound.
 */
export function resolveOauthRedemptionTenant(args: { code: string; tenantHint?: string }): OauthTenantResolution {
  const bound = asTenantUuid(tenantIdFromBoundToken(args.code));
  const hint = asTenantUuid(args.tenantHint);
  if (bound) {
    return {
      tenantId: bound,
      boundPresent: true,
      hintPresent: Boolean(hint),
      usedBoundTenant: true,
      usedHint: false,
      hintMatchesBound: hint ? hint === bound : null,
    };
  }
  if (hint) {
    return {
      tenantId: hint,
      boundPresent: false,
      hintPresent: true,
      usedBoundTenant: false,
      usedHint: true,
      hintMatchesBound: null,
    };
  }
  return {
    tenantId: null,
    boundPresent: Boolean(tenantIdFromBoundToken(args.code)),
    hintPresent: Boolean(args.tenantHint?.trim()),
    usedBoundTenant: false,
    usedHint: false,
    hintMatchesBound: null,
  };
}

function redirectParts(uri: string): { scheme: string | null; host: string | null; port: string | null; path: string | null } {
  try {
    const parsed = new URL(uri);
    const scheme = parsed.protocol.replace(/:$/, '');
    const port = parsed.port || (scheme === 'https' ? '443' : scheme === 'http' ? '80' : '');
    return { scheme, host: parsed.hostname || null, port, path: parsed.pathname || null };
  } catch {
    return { scheme: null, host: null, port: null, path: null };
  }
}

export function compareRedirectUris(stored: string, presented: string): OauthRedirectComparison {
  const left = redirectParts(stored);
  const right = redirectParts(presented);
  return {
    storedHost: left.host,
    presentedHost: right.host,
    storedPort: left.port,
    presentedPort: right.port,
    hostsEqual: Boolean(left.host) && left.host === right.host,
    portsEqual: Boolean(left.port) && left.port === right.port,
    pathsEqual: Boolean(left.path) && left.path === right.path,
    schemesEqual: Boolean(left.scheme) && left.scheme === right.scheme,
    exactEqual: stored === presented,
  };
}

export function emptyOauthRedeemFlags(over: Partial<OauthRedeemFlags> = {}): OauthRedeemFlags {
  return {
    boundPresent: false,
    hintPresent: false,
    usedBoundTenant: false,
    usedHint: false,
    hintMatchesBound: null,
    rowFound: false,
    consumed: false,
    clientMatches: null,
    tenantGucPresent: null,
    tenantGucMatches: null,
    tenantGucResetInTransaction: null,
    hostsEqual: null,
    portsEqual: null,
    pathsEqual: null,
    schemesEqual: null,
    exactRedirectEqual: null,
    storedHost: null,
    presentedHost: null,
    storedPort: null,
    presentedPort: null,
    codeLength: 0,
    verifierPresent: false,
    challengeMethod: null,
    ...over,
  };
}

export function flagsFromTenantResolution(resolution: OauthTenantResolution): Pick<
  OauthRedeemFlags,
  'boundPresent' | 'hintPresent' | 'usedBoundTenant' | 'usedHint' | 'hintMatchesBound'
> {
  return {
    boundPresent: resolution.boundPresent,
    hintPresent: resolution.hintPresent,
    usedBoundTenant: resolution.usedBoundTenant,
    usedHint: resolution.usedHint,
    hintMatchesBound: resolution.hintMatchesBound,
  };
}

export function decideOauthCodeRedemption(row: RedeemableCode | null | undefined, args: RedeemBindings): RedeemDecision {
  if (!row) return { action: 'invalid_grant', consume: false, reason: 'row_missing_or_rls_hidden' };
  if (row.usedAt) return { action: 'invalid_grant', consume: false, reason: 'used_code' };
  if (row.clientId !== args.clientId) return { action: 'invalid_grant', consume: false, reason: 'client_mismatch' };
  const kind = args.kind ?? 'authorization_code';
  if (kind === 'refresh_token') {
    if (row.codeChallenge !== 'refresh_token') return { action: 'invalid_grant', consume: false, reason: 'refresh_mismatch' };
    if (row.expiresAt <= (args.now ?? Date.now())) {
      return { action: 'invalid_grant', consume: true, reason: 'expired', description: 'Refresh token expired.' };
    }
    return { action: 'issue', consume: true, reason: 'issued' };
  }
  if (!redirectUrisMatch(row.redirectUri, args.redirectUri)) {
    return { action: 'invalid_grant', consume: false, reason: 'redirect_mismatch' };
  }
  if (row.expiresAt <= (args.now ?? Date.now())) {
    return { action: 'invalid_grant', consume: true, reason: 'expired', description: 'Authorization code expired.' };
  }
  if (!verifyPkce(args.codeVerifier ?? '', row.codeChallenge, row.codeChallengeMethod)) {
    return { action: 'invalid_grant', consume: true, reason: 'pkce_mismatch', description: 'PKCE verification failed.' };
  }
  return { action: 'issue', consume: true, reason: 'issued' };
}

export function buildOauthRedeemDiagnostic(args: {
  requestId: string;
  reason: OauthRedeemReason;
  now?: number;
  flags: OauthRedeemFlags;
}): SanitizedOauthRedeemDiagnostic {
  return {
    requestId: args.requestId,
    reason: args.reason,
    at: new Date(args.now ?? Date.now()).toISOString(),
    flags: emptyOauthRedeemFlags(args.flags),
  };
}

const SECRET_LOG_PATTERN =
  /code_verifier|refresh_token|access_token|authorization|private.?key|BEGIN [A-Z ]*PRIVATE|code_challenge=/i;

export function oauthRedeemLogLine(diagnostic: SanitizedOauthRedeemDiagnostic): string {
  const line = JSON.stringify({
    msg: 'agent_bridge_oauth_redeem',
    requestId: diagnostic.requestId,
    reason: diagnostic.reason,
    at: diagnostic.at,
    flags: diagnostic.flags,
  });
  if (SECRET_LOG_PATTERN.test(line)) {
    return JSON.stringify({
      msg: 'agent_bridge_oauth_redeem',
      requestId: diagnostic.requestId,
      reason: diagnostic.reason,
      at: diagnostic.at,
      flags: { suppressed: true },
    });
  }
  return line;
}

const OAUTH_REDEEM_REASONS: OauthRedeemReason[] = [
  'issued',
  'code_issued',
  'missing_tenant_binding',
  'row_missing_or_rls_hidden',
  'used_code',
  'client_mismatch',
  'redirect_mismatch',
  'expired',
  'pkce_mismatch',
  'refresh_mismatch',
  'concurrent_consume',
];

function asRedeemReason(value: string): OauthRedeemReason | null {
  return (OAUTH_REDEEM_REASONS as string[]).includes(value) ? (value as OauthRedeemReason) : null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function diagnosticFromStored(row: {
  requestId: string;
  reason: string;
  at: string;
  flags: Record<string, boolean | string | null | number>;
}): SanitizedOauthRedeemDiagnostic | null {
  const reason = asRedeemReason(row.reason);
  if (!reason) return null;
  return buildOauthRedeemDiagnostic({
    requestId: row.requestId,
    reason,
    now: Date.parse(row.at) || Date.now(),
    flags: emptyOauthRedeemFlags({
      boundPresent: Boolean(row.flags.boundPresent),
      hintPresent: Boolean(row.flags.hintPresent),
      usedBoundTenant: Boolean(row.flags.usedBoundTenant),
      usedHint: Boolean(row.flags.usedHint),
      hintMatchesBound: asBool(row.flags.hintMatchesBound),
      rowFound: Boolean(row.flags.rowFound),
      consumed: Boolean(row.flags.consumed),
      clientMatches: asBool(row.flags.clientMatches),
      tenantGucPresent: asBool(row.flags.tenantGucPresent),
      tenantGucMatches: asBool(row.flags.tenantGucMatches),
      tenantGucResetInTransaction: asBool(row.flags.tenantGucResetInTransaction),
      hostsEqual: asBool(row.flags.hostsEqual),
      portsEqual: asBool(row.flags.portsEqual),
      pathsEqual: asBool(row.flags.pathsEqual),
      schemesEqual: asBool(row.flags.schemesEqual),
      exactRedirectEqual: asBool(row.flags.exactRedirectEqual),
      storedHost: asString(row.flags.storedHost),
      presentedHost: asString(row.flags.presentedHost),
      storedPort: asString(row.flags.storedPort),
      presentedPort: asString(row.flags.presentedPort),
      codeLength: typeof row.flags.codeLength === 'number' ? row.flags.codeLength : 0,
      verifierPresent: Boolean(row.flags.verifierPresent),
      challengeMethod: asString(row.flags.challengeMethod),
    }),
  });
}

export function formatStoredOauthDiagnostic(row: {
  requestId: string;
  reason: string;
  at: string;
  flags: Record<string, boolean | string | null | number>;
}): string | null {
  const diagnostic = diagnosticFromStored(row);
  return diagnostic ? formatOauthRedeemDiagnostic(diagnostic) : null;
}

export function formatOauthRedeemDiagnostic(diagnostic: SanitizedOauthRedeemDiagnostic): string {
  const shortId = diagnostic.requestId.slice(0, 8);
  if (diagnostic.reason === 'code_issued') {
    return `Authorization code issued. Waiting for token exchange. Request ${shortId}.`;
  }
  if (diagnostic.reason === 'issued') {
    return `Token issued. Request ${shortId}.`;
  }
  const flags = diagnostic.flags;
  const parts = [`Last token attempt refused: ${diagnostic.reason}.`];
  if (diagnostic.reason === 'redirect_mismatch') {
    parts.push(
      `Hosts equal: ${flags.hostsEqual ? 'yes' : 'no'}${
        flags.storedHost || flags.presentedHost ? ` (${flags.storedHost ?? '—'} vs ${flags.presentedHost ?? '—'})` : ''
      }.`,
    );
    parts.push(`Ports equal: ${flags.portsEqual ? 'yes' : 'no'}. Paths equal: ${flags.pathsEqual ? 'yes' : 'no'}.`);
  }
  if (diagnostic.reason === 'client_mismatch') {
    parts.push(`Client matches: ${flags.clientMatches ? 'yes' : 'no'}.`);
  }
  if (flags.hintPresent && flags.boundPresent) {
    parts.push(`Hint matches bound tenant: ${flags.hintMatchesBound ? 'yes' : 'no'}.`);
  }
  if (flags.tenantGucResetInTransaction) {
    parts.push('Tenant GUC was reset inside the redemption transaction.');
  }
  parts.push(`Request ${shortId}.`);
  return parts.join(' ');
}

export type MutableCodeStore = {
  get(code: string): RedeemableCode | AuthorizationCode | undefined | null;
  set(code: string, row: RedeemableCode | AuthorizationCode): void;
};

export type RedeemResult<T> =
  | { ok: true; row: T; reason: 'issued' }
  | { ok: false; error: 'invalid_grant'; reason: OauthRedeemReason; description?: string };

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
    if (decision.action === 'issue') return { ok: true, row: consumed as T, reason: 'issued' };
    return { ok: false, error: 'invalid_grant', reason: decision.reason, description: decision.description };
  }
  if (decision.action === 'issue') {
    return { ok: false, error: 'invalid_grant', reason: 'concurrent_consume' };
  }
  return { ok: false, error: 'invalid_grant', reason: decision.reason, description: decision.description };
}

export async function redeemConcurrently<T>(
  tasks: Array<() => Promise<T>>,
): Promise<T[]> {
  return Promise.all(tasks.map((task) => task()));
}
