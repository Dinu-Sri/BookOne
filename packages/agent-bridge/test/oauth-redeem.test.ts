import { describe, expect, it } from 'vitest';
import {
  createPkcePair,
  encodeTenantBoundCode,
  MemoryAuthorizationCodeStore,
  type AuthorizationCode,
} from '../src/oauth';
import {
  compareRedirectUris,
  decideOauthCodeRedemption,
  formatOauthRedeemDiagnostic,
  oauthRedeemLogLine,
  redeemStoredCode,
  redirectUrisMatch,
  resolveOauthRedemptionTenant,
  type MutableCodeStore,
} from '../src/oauth-redeem';

function codeRow(over: Partial<AuthorizationCode> & Pick<AuthorizationCode, 'codeChallenge'>): AuthorizationCode {
  return {
    code: 'tenant.nonce',
    tenantId: 'tenant-a',
    userId: 'user-a',
    clientId: 'bookone-codex',
    redirectUri: 'http://127.0.0.1:43111/callback/989kWVAG9tcl',
    codeChallengeMethod: 'S256',
    scopes: ['read', 'upload', 'draft'],
    connectionId: 'conn-1',
    expiresAt: Date.now() + 60_000,
    ...over,
  };
}

function mutableFrom(store: MemoryAuthorizationCodeStore): MutableCodeStore {
  return {
    get: (code) => store.peekCode(code),
    set: (_code, row) => store.replaceCode(row as AuthorizationCode),
  };
}

describe('AB-09 OAuth code redemption', () => {
  it('keeps exact redirect host/path/port and does not alias localhost to 127.0.0.1', () => {
    const stored = 'http://127.0.0.1:43111/callback/989kWVAG9tcl';
    expect(redirectUrisMatch(stored, stored)).toBe(true);
    expect(redirectUrisMatch(stored, 'http://localhost:43111/callback/989kWVAG9tcl')).toBe(false);
    expect(redirectUrisMatch(stored, 'http://127.0.0.1:43112/callback/989kWVAG9tcl')).toBe(false);
    expect(redirectUrisMatch(stored, 'http://127.0.0.1:43111/callback/other')).toBe(false);
    expect(redirectUrisMatch(stored, '')).toBe(false);
  });

  it('issues once for matching client, redirect and PKCE', async () => {
    const pkce = createPkcePair();
    const store = new MemoryAuthorizationCodeStore();
    const row = codeRow({ codeChallenge: pkce.challenge });
    await store.saveCode(row);
    const first = redeemStoredCode(mutableFrom(store), row.code, {
      clientId: row.clientId,
      redirectUri: row.redirectUri,
      codeVerifier: pkce.verifier,
    });
    expect(first.ok).toBe(true);
    const second = redeemStoredCode(mutableFrom(store), row.code, {
      clientId: row.clientId,
      redirectUri: row.redirectUri,
      codeVerifier: pkce.verifier,
    });
    expect(second.ok).toBe(false);
    expect(store.peekCode(row.code)?.usedAt).toBeTruthy();
  });

  it('refuses a wrong client or redirect without consuming the code', async () => {
    const pkce = createPkcePair();
    const store = new MemoryAuthorizationCodeStore();
    const row = codeRow({ codeChallenge: pkce.challenge });
    await store.saveCode(row);
    const wrongClient = redeemStoredCode(mutableFrom(store), row.code, {
      clientId: 'bookone-claude',
      redirectUri: row.redirectUri,
      codeVerifier: pkce.verifier,
    });
    expect(wrongClient.ok).toBe(false);
    expect(store.peekCode(row.code)?.usedAt).toBeFalsy();
    const wrongHost = redeemStoredCode(mutableFrom(store), row.code, {
      clientId: row.clientId,
      redirectUri: 'http://localhost:43111/callback/989kWVAG9tcl',
      codeVerifier: pkce.verifier,
    });
    expect(wrongHost.ok).toBe(false);
    expect(store.peekCode(row.code)?.usedAt).toBeFalsy();
    const ok = redeemStoredCode(mutableFrom(store), row.code, {
      clientId: row.clientId,
      redirectUri: row.redirectUri,
      codeVerifier: pkce.verifier,
    });
    expect(ok.ok).toBe(true);
  });

  it('consumes on PKCE failure and expiry so the verifier cannot be retried', async () => {
    const pkce = createPkcePair();
    const store = new MemoryAuthorizationCodeStore();
    const row = codeRow({ codeChallenge: pkce.challenge });
    await store.saveCode(row);
    const bad = redeemStoredCode(mutableFrom(store), row.code, {
      clientId: row.clientId,
      redirectUri: row.redirectUri,
      codeVerifier: 'wrong-verifier-value-that-is-long-enough-xx',
    });
    expect(bad.ok).toBe(false);
    expect(store.peekCode(row.code)?.usedAt).toBeTruthy();
    const expiredStore = new MemoryAuthorizationCodeStore();
    const expired = codeRow({ code: 'tenant.expired', codeChallenge: pkce.challenge, expiresAt: Date.now() - 1 });
    await expiredStore.saveCode(expired);
    const expiredResult = redeemStoredCode(mutableFrom(expiredStore), expired.code, {
      clientId: expired.clientId,
      redirectUri: expired.redirectUri,
      codeVerifier: pkce.verifier,
    });
    expect(expiredResult.ok).toBe(false);
    expect(expiredStore.peekCode(expired.code)?.usedAt).toBeTruthy();
  });

  it('lets only one concurrent matching redemption issue tokens', async () => {
    const pkce = createPkcePair();
    const store = new MemoryAuthorizationCodeStore();
    const row = codeRow({ codeChallenge: pkce.challenge });
    await store.saveCode(row);
    const args = {
      clientId: row.clientId,
      redirectUri: row.redirectUri,
      codeVerifier: pkce.verifier,
    };
    const results = await Promise.all([
      Promise.resolve(redeemStoredCode(mutableFrom(store), row.code, args)),
      Promise.resolve(redeemStoredCode(mutableFrom(store), row.code, args)),
      Promise.resolve(redeemStoredCode(mutableFrom(store), row.code, args)),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(2);
  });

  it('does not consume when minting is not ready', () => {
    const pkce = createPkcePair();
    const row = codeRow({ codeChallenge: pkce.challenge });
    const decision = decideOauthCodeRedemption(
      {
        ...row,
        connectionId: row.connectionId,
        usedAt: null,
      },
      {
        clientId: row.clientId,
        redirectUri: row.redirectUri,
        codeVerifier: pkce.verifier,
      },
    );
    expect(decision.action).toBe('issue');
  });

  it('classifies rejection reasons without consuming on binding mismatch', () => {
    const pkce = createPkcePair();
    const row = codeRow({ codeChallenge: pkce.challenge });
    expect(decideOauthCodeRedemption(null, { clientId: row.clientId, redirectUri: row.redirectUri }).reason).toBe(
      'row_missing_or_rls_hidden',
    );
    expect(
      decideOauthCodeRedemption({ ...row, usedAt: Date.now() }, { clientId: row.clientId, redirectUri: row.redirectUri })
        .reason,
    ).toBe('used_code');
    expect(
      decideOauthCodeRedemption(row, { clientId: 'bookone-claude', redirectUri: row.redirectUri, codeVerifier: pkce.verifier })
        .reason,
    ).toBe('client_mismatch');
    expect(
      decideOauthCodeRedemption(row, {
        clientId: row.clientId,
        redirectUri: 'http://localhost:43111/callback/989kWVAG9tcl',
        codeVerifier: pkce.verifier,
      }).reason,
    ).toBe('redirect_mismatch');
  });

  it('lets a tenant-bound code win over a different tenant hint', () => {
    const tenant = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const other = 'ffffffff-0000-4000-8000-999999999999';
    const code = encodeTenantBoundCode(tenant);
    const bound = resolveOauthRedemptionTenant({ code, tenantHint: other });
    expect(bound.tenantId).toBe(tenant);
    expect(bound.usedBoundTenant).toBe(true);
    expect(bound.usedHint).toBe(false);
    expect(bound.hintMatchesBound).toBe(false);
    const fallback = resolveOauthRedemptionTenant({ code: 'not-a-bound-code', tenantHint: other });
    expect(fallback.tenantId).toBe(other);
    expect(fallback.usedHint).toBe(true);
    expect(resolveOauthRedemptionTenant({ code: 'not-a-bound-code' }).tenantId).toBeNull();
  });

  it('records redirect host comparison as booleans and does not alias localhost', () => {
    const stored = 'http://127.0.0.1:43111/callback/989kWVAG9tcl';
    const presented = 'http://localhost:43111/callback/989kWVAG9tcl';
    const cmp = compareRedirectUris(stored, presented);
    expect(cmp.exactEqual).toBe(false);
    expect(cmp.hostsEqual).toBe(false);
    expect(cmp.portsEqual).toBe(true);
    expect(cmp.pathsEqual).toBe(true);
    expect(cmp.storedHost).toBe('127.0.0.1');
    expect(cmp.presentedHost).toBe('localhost');
  });

  it('formats and logs diagnostics without secrets', () => {
    const diagnostic = {
      requestId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      reason: 'redirect_mismatch' as const,
      at: '2026-11-19T12:00:00.000Z',
      flags: {
        boundPresent: true,
        hintPresent: false,
        usedBoundTenant: true,
        usedHint: false,
        hintMatchesBound: null,
        rowFound: true,
        consumed: false,
        clientMatches: true,
        tenantGucPresent: true,
        tenantGucMatches: true,
        tenantGucResetInTransaction: false,
        hostsEqual: false,
        portsEqual: true,
        pathsEqual: true,
        schemesEqual: true,
        exactRedirectEqual: false,
        storedHost: '127.0.0.1',
        presentedHost: 'localhost',
        storedPort: '43111',
        presentedPort: '43111',
        codeLength: 81,
        verifierPresent: true,
        challengeMethod: 'S256',
      },
    };
    const text = formatOauthRedeemDiagnostic(diagnostic);
    const log = oauthRedeemLogLine(diagnostic);
    expect(text).toMatch(/redirect_mismatch/);
    expect(text).toMatch(/Hosts equal: no \(127\.0\.0\.1 vs localhost\)/);
    expect(text).toMatch(/Request aaaaaaaa/);
    expect(log).toMatch(/"reason":"redirect_mismatch"/);
    expect(text).not.toMatch(/code_verifier|refresh_token|access_token|BEGIN /i);
    expect(log).not.toMatch(/code_verifier|refresh_token|access_token|BEGIN /i);
  });
});
