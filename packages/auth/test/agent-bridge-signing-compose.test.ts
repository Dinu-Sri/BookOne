import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepo(...parts: string[]) {
  return readFileSync(path.resolve(__dirname, '../../..', ...parts), 'utf8');
}

describe('staging AgentBridge signing compose', () => {
  it('forwards public URL, issuer, kid, PEM env, and a read-only secret file mount', () => {
    const staging = readRepo('docker/docker-compose.staging.yml');
    const prod = readRepo('docker/docker-compose.prod.yml');
    for (const yaml of [staging, prod]) {
      expect(yaml).toMatch(/AGENT_BRIDGE_PUBLIC_URL=\$\{AGENT_BRIDGE_PUBLIC_URL:-\}/);
      expect(yaml).toMatch(/AGENT_BRIDGE_OAUTH_ISSUER=\$\{AGENT_BRIDGE_OAUTH_ISSUER:-\}/);
      expect(yaml).toMatch(/AGENT_BRIDGE_OAUTH_KID=\$\{AGENT_BRIDGE_OAUTH_KID:-\}/);
      expect(yaml).toMatch(/AGENT_BRIDGE_OAUTH_SIGNING_PEM=\$\{AGENT_BRIDGE_OAUTH_SIGNING_PEM:-\}/);
      expect(yaml).toMatch(
        /AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE=\$\{AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE:-\/run\/secrets\/agent_bridge_oauth_signing\.pem\}/,
      );
      expect(yaml).toMatch(
        /\$\{AGENT_BRIDGE_OAUTH_SIGNING_PEM_HOST:-\/opt\/bookone\/secrets\/agent_bridge_oauth_signing\.pem\}:\/run\/secrets\/agent_bridge_oauth_signing\.pem:ro/,
      );
      expect(yaml).not.toMatch(/^\s*- AGENT_BRIDGE_ALLOW_HMAC=/m);
      expect(yaml).not.toMatch(/BEGIN (?:RSA )?PRIVATE KEY/);
    }
  });

  it('does not generate or log a signing key in the existing entrypoint', () => {
    const entry = readRepo('docker/entrypoint.sh');
    expect(entry).toMatch(/exec pnpm --dir apps\/web exec next start/);
    expect(entry).not.toMatch(/openssl|genpkey|SIGNING_PEM/);
  });
});
