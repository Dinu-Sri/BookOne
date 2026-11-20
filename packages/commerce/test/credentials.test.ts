import { describe, expect, it } from 'vitest';
import { hashSecret, hashesEqual, issueToken, parseToken, rateLimit, resetRateLimitForTests } from '../src/credentials';
import { COMMERCE_OPENAPI, CURL_EXAMPLES } from '../src/openapi';

describe('commerce credentials', () => {
  it('issues a bkc token with a lookup prefix and never returns the secret from parse of a bad token', () => {
    const issued = issueToken('sandbox');
    expect(issued.token.startsWith('bkc_sand_')).toBe(true);
    const parsed = parseToken(issued.token);
    expect(parsed?.prefix).toBe(issued.prefix);
    expect(parsed?.secret).toBe(issued.secret);
    expect(parseToken('not-a-token')).toBeNull();
    expect(parseToken('bkc_sand_short_abc')).toBeNull();
    const pepper = 'test-pepper';
    const hash = hashSecret(issued.secret, pepper);
    expect(hashesEqual(hash, hashSecret(issued.secret, pepper))).toBe(true);
    expect(hashesEqual(hash, hashSecret('other', pepper))).toBe(false);
  });

  it('rate-limits a credential after the window is exceeded', () => {
    resetRateLimitForTests();
    const first = rateLimit('k1', 2, 60_000);
    const second = rateLimit('k1', 2, 60_000);
    const third = rateLimit('k1', 2, 60_000);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
  });

  it('publishes OpenAPI v1 and server-side curl examples that keep the token in an env var', () => {
    expect(COMMERCE_OPENAPI.openapi).toBe('3.1.0');
    expect(COMMERCE_OPENAPI.paths['/orders']).toBeTruthy();
    expect(COMMERCE_OPENAPI.paths['/reservations']).toBeTruthy();
    expect(CURL_EXAMPLES).toMatch(/BOOKONE_COMMERCE_TOKEN/);
    expect(CURL_EXAMPLES).toMatch(/Keep the secret on the server/);
  });
});
