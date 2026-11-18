import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepo(...parts: string[]) {
  return readFileSync(path.resolve(__dirname, '../../..', ...parts), 'utf8');
}

describe('staging AgentBridge signing compose', () => {
  it('persists internal signing on a named volume and defaults public URL/issuer', () => {
    const staging = readRepo('docker/docker-compose.staging.yml');
    const prod = readRepo('docker/docker-compose.prod.yml');
    const dockerfile = readRepo('docker/Dockerfile.web');
    for (const yaml of [staging, prod]) {
      expect(yaml).toMatch(
        /AGENT_BRIDGE_PUBLIC_URL=\$\{AGENT_BRIDGE_PUBLIC_URL:-https:\/\/bookone\.clossyan\.com\}/,
      );
      expect(yaml).toMatch(
        /AGENT_BRIDGE_OAUTH_ISSUER=\$\{AGENT_BRIDGE_OAUTH_ISSUER:-https:\/\/bookone\.clossyan\.com\}/,
      );
      expect(yaml).toMatch(/AGENT_BRIDGE_OAUTH_KID=\$\{AGENT_BRIDGE_OAUTH_KID:-/);
      expect(yaml).toMatch(/AGENT_BRIDGE_OAUTH_SIGNING_PEM=\$\{AGENT_BRIDGE_OAUTH_SIGNING_PEM:-\}/);
      expect(yaml).toMatch(
        /AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE=\$\{AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE:-\/var\/lib\/bookone\/secrets\/agent_bridge_oauth_signing\.pem\}/,
      );
      expect(yaml).toMatch(/agent_bridge_signing:\/var\/lib\/bookone\/secrets/);
      expect(yaml).toMatch(/^ {2}agent_bridge_signing:$/m);
      expect(yaml).not.toMatch(/AGENT_BRIDGE_OAUTH_SIGNING_PEM_HOST/);
      expect(yaml).not.toMatch(/^\s*- AGENT_BRIDGE_ALLOW_HMAC=/m);
      expect(yaml).not.toMatch(/BEGIN (?:RSA )?PRIVATE KEY/);
    }
    expect(dockerfile).toMatch(/\/var\/lib\/bookone\/secrets/);
    expect(dockerfile).toMatch(/chown -R nextjs:nodejs .*\/var\/lib\/bookone/);
  });

  it('does not generate or log a signing key in the existing entrypoint', () => {
    const entry = readRepo('docker/entrypoint.sh');
    expect(entry).toMatch(/exec pnpm --dir apps\/web exec next start/);
    expect(entry).not.toMatch(/openssl|genpkey|SIGNING_PEM/);
  });
});
