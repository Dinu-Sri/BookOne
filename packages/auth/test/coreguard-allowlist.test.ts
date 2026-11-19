import { describe, expect, it } from 'vitest';
import {
  assertDisposableAppUrl,
  assertDisposableDatabaseUrl,
  assertDisposableStorage,
} from '../../../scripts/coreguard/allowlist';

describe('CoreGuard disposable-target allowlist', () => {
  it('accepts the CI bookone_test database on localhost', () => {
    const url = assertDisposableDatabaseUrl('postgres://bookone:bookone@localhost:5432/bookone_test');
    expect(url.hostname).toBe('localhost');
  });

  it('refuses the local development bookone database', () => {
    expect(() => assertDisposableDatabaseUrl('postgres://bookone:bookone@localhost:5432/bookone')).toThrow(
      /REFUSED/,
    );
  });

  it('refuses staging/production hosts even with a test name', () => {
    expect(() =>
      assertDisposableDatabaseUrl('postgres://bookone:bookone@bookone.clossyan.com:5432/bookone_test'),
    ).toThrow(/REFUSED/);
  });

  it('refuses remote object storage and non-local AUTH_URL', () => {
    expect(() =>
      assertDisposableStorage({
        endpoint: 'https://abc.r2.cloudflarestorage.com',
        bucket: 'bookone-test',
      }),
    ).toThrow(/REFUSED/);
    expect(() => assertDisposableAppUrl('https://bookone.clossyan.com')).toThrow(/REFUSED/);
    assertDisposableStorage({ endpoint: 'http://127.0.0.1:9000', bucket: 'bookone-test' });
    assertDisposableAppUrl('http://127.0.0.1:3000');
  });
});
