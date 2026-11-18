import { describe, expect, it } from 'vitest';
import { createPkcePair, MemoryAuthorizationCodeStore, type AuthorizationCode } from '../src/oauth';
import {
  decideOauthCodeRedemption,
  redeemStoredCode,
  redirectUrisMatch,
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
});
