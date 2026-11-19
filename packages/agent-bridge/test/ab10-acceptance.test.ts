import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COREGUARD_VERSION } from '../src/coreguard';
import { SCHEMA_VERSION } from '../src/contracts';

const root = path.resolve(__dirname, '../../..');
function read(...parts: string[]) {
  return readFileSync(path.join(root, ...parts), 'utf8');
}

describe('AB-10 source contracts', () => {
  it('keeps CoreGuard at ab-10 or later and protocol schema ab-06.1', () => {
    expect(COREGUARD_VERSION).toMatch(/^ab-1\d$/);
    expect(SCHEMA_VERSION).toBe('ab-06.1');
    expect(read('packages/db/src/schema/agent-bridge.ts')).toMatch(/redirectUri: text\('redirect_uri'\)/);
  });

  it('reads authorize query from the Fetch Request URL instead of NextURL', () => {
    const authorize = read('apps/web/src/app/api/agent-bridge/oauth/authorize/route.ts');
    const helper = read('packages/agent-bridge/src/oauth-request-url.ts');
    expect(helper).toMatch(/Request\.prototype/);
    expect(helper).toMatch(/oauthSearchParams/);
    expect(authorize).toMatch(/oauthSearchParams\(req\)/);
    expect(authorize).toMatch(/oauthSignInFromTarget\(req\)/);
    expect(authorize).not.toMatch(/req\.nextUrl\.searchParams\.get\('redirect_uri'\)/);
    expect(authorize).not.toMatch(/url\.searchParams\.get\('redirect_uri'\)/);
    expect(authorize).toMatch(/form\.get\('redirect_uri'\)/);
  });

  it('keeps exact redirect equality and does not alias loopback hosts', () => {
    const redeem = read('packages/agent-bridge/src/oauth-redeem.ts');
    const helper = read('packages/agent-bridge/src/oauth-request-url.ts');
    expect(redeem).toMatch(/stored === presented/);
    expect(redeem).toMatch(/127\.0\.0\.1 and localhost are different hosts/);
    expect(helper).not.toMatch(/127\.0\.0\.1 === 'localhost'/);
    expect(read('apps/web/next.config.mjs')).not.toMatch(/skipMiddlewareUrlNormalize/);
  });

  it('preserves the nested callback through sign-in from= using the browser Location search', () => {
    const login = read('apps/web/src/app/login/page.tsx');
    expect(login).toMatch(/window\.location\.search/);
    expect(login).toMatch(/callbackURLFromSearch/);
    expect(login).not.toMatch(/from '@bookone\/agent-bridge'/);
  });
});
