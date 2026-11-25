import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configuredOrigins, pickPublicOrigin } from '../../../apps/web/src/lib/public-origin-core';

const env = {
  AUTH_URL: 'https://bookone.clossyan.com',
  BETTER_AUTH_URL: 'https://bookone.clossyan.com/',
  BETTER_AUTH_TRUSTED_ORIGINS: 'https://bookone.clossyan.com, https://staging.clossyan.com',
};

describe('public origin for absolute links', () => {
  it('lists configured origins once, primary first', () => {
    expect(configuredOrigins(env)).toEqual(['https://bookone.clossyan.com', 'https://staging.clossyan.com']);
  });

  it('uses the host the user is on when it is configured', () => {
    expect(pickPublicOrigin('staging.clossyan.com', env)).toBe('https://staging.clossyan.com');
    expect(pickPublicOrigin('bookone.clossyan.com', env)).toBe('https://bookone.clossyan.com');
  });

  it('keeps the configured https scheme behind the http proxy hop', () => {
    expect(pickPublicOrigin('STAGING.clossyan.com, internal', env)).toBe('https://staging.clossyan.com');
  });

  it('never trusts an unknown Host header', () => {
    expect(pickPublicOrigin('evil.example', env)).toBe('https://bookone.clossyan.com');
    expect(pickPublicOrigin('', env)).toBe('https://bookone.clossyan.com');
    expect(pickPublicOrigin(null, env)).toBe('https://bookone.clossyan.com');
  });

  it('returns empty when nothing is configured', () => {
    expect(pickPublicOrigin('staging.clossyan.com', {})).toBe('');
  });

  it('link builders no longer read AUTH_URL directly', () => {
    const web = path.resolve(__dirname, '../../../apps/web/src');
    for (const rel of [
      'app/actions/team.ts',
      'app/actions/document-print.ts',
      'app/purchase/inbox/[id]/file/route.ts',
      'lib/layout.shared.tsx',
    ]) {
      const src = readFileSync(path.join(web, rel), 'utf8');
      expect(src, rel).not.toMatch(/process\.env\.(AUTH_URL|BETTER_AUTH_URL|APP_URL)/);
    }
  });
});
