import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  jwksFromSigningPem,
  mintLocalFixtureToken,
  mintRs256AccessToken,
  oauthSigningPem,
  resolveActorFromAuthorization,
  TOKEN_AUDIENCE,
  verifyOAuthAccessToken,
} from '../src/authz';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as { n?: string; e?: string; kty?: string };

function signRs256(header: object, payload: object): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${h}.${p}`);
  signer.end();
  return `${h}.${p}.${signer.sign(privateKey).toString('base64url')}`;
}

let server: Server;
let issuer = '';
let jwksUrl = '';

describe('OAuth RS256 JWKS interoperability', () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/jwks.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [{ ...jwk, kid: 'ab03', kty: 'RSA', alg: 'RS256', use: 'sig' }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('JWKS server did not bind');
    issuer = `http://127.0.0.1:${address.port}`;
    jwksUrl = `${issuer}/jwks.json`;
  });

  afterAll(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!server) return resolve();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  it('resolves a locally issued RS256 access token through JWKS HTTP', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = signRs256(
      { alg: 'RS256', kid: 'ab03' },
      {
        iss: issuer,
        aud: TOKEN_AUDIENCE,
        sub: 'user-1',
        tenant_id: 'tenant-1',
        client_id: 'cli-1',
        connection_id: 'conn-1',
        scope: 'purchase.inbox.read agent_bridge.post',
        iat: nowSec,
        exp: nowSec + 3600,
      },
    );
    const actor = await resolveActorFromAuthorization(`Bearer ${token}`, 'hmac-unused', {
      AGENT_BRIDGE_OAUTH_ISSUER: issuer,
      AGENT_BRIDGE_OAUTH_JWKS_URL: jwksUrl,
    });
    expect(actor).toMatchObject({ userId: 'user-1', tenantId: 'tenant-1', clientId: 'cli-1' });
    expect(actor.capabilities).toEqual(expect.arrayContaining(['read', 'post']));
  });

  it('still accepts labelled HMAC fixtures on the same resolver', async () => {
    const hmac = mintLocalFixtureToken({
      tenantId: 't-hmac',
      userId: 'u-hmac',
      scopes: ['read'],
      secret: 'fixture-secret',
    });
    const actor = await resolveActorFromAuthorization(`Bearer ${hmac}`, 'fixture-secret');
    expect(actor.tenantId).toBe('t-hmac');
    await expect(verifyOAuthAccessToken(hmac, { AGENT_BRIDGE_OAUTH_ISSUER: issuer })).rejects.toThrow(
      /not production OAuth/,
    );
  });

  it('mints a BookOne-as-AS RS256 access token that verifies through JWKS', async () => {
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const token = mintRs256AccessToken({
      privateKeyPem: pem,
      kid: 'ab03',
      issuer,
      tenantId: 'tenant-as',
      userId: 'user-as',
      clientId: 'bookone-codex',
      connectionId: 'conn-as',
      scopes: ['read', 'upload', 'draft'],
    });
    const derived = jwksFromSigningPem(pem, 'ab03');
    expect(derived.keys[0]?.kid).toBe('ab03');
    const actor = await resolveActorFromAuthorization(`Bearer ${token}`, 'hmac-unused', {
      AGENT_BRIDGE_OAUTH_ISSUER: issuer,
      AGENT_BRIDGE_OAUTH_JWKS_URL: jwksUrl,
    });
    expect(actor).toMatchObject({ userId: 'user-as', tenantId: 'tenant-as', clientId: 'bookone-codex' });
    expect(actor.capabilities).toEqual(['read', 'upload', 'draft']);
    expect(actor.capabilities).not.toContain('post');
  });
});

describe('OAuth signing PEM file and public JWKS', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ab-signing-'));
  const pemPath = path.join(dir, 'agent_bridge_oauth_signing.pem');
  const filePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const envPem = otherKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  beforeAll(() => {
    writeFileSync(pemPath, filePem, 'utf8');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads PKCS8 from AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE and ignores a different env PEM', () => {
    const loaded = oauthSigningPem({
      AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE: pemPath,
      AGENT_BRIDGE_OAUTH_SIGNING_PEM: envPem,
    });
    expect(loaded).toBe(filePem.trim());
    expect(oauthSigningPem({ AGENT_BRIDGE_OAUTH_SIGNING_PEM: envPem })).toBe(envPem.trim());
    expect(oauthSigningPem({ AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE: path.join(dir, 'missing.pem') })).toBeUndefined();
    expect(oauthSigningPem({ AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE: 'relative.pem' })).toBeUndefined();
  });

  it('derives a public-only JWKS that verifies a token minted from that private key', async () => {
    const pem = oauthSigningPem({ AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE: pemPath });
    expect(pem).toBeTruthy();
    const kid = 'bookone-staging-agentbridge-01';
    const jwks = jwksFromSigningPem(pem!, kid);
    const key = jwks.keys[0]!;
    expect(Object.keys(key).sort()).toEqual(['alg', 'e', 'kid', 'kty', 'n', 'use']);
    expect(key).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256', kid });
    expect(key).not.toHaveProperty('d');
    expect(key).not.toHaveProperty('p');
    expect(key).not.toHaveProperty('q');
    expect(JSON.stringify(jwks)).not.toMatch(/BEGIN PRIVATE|PRIVATE KEY/);
    const server = createServer((req, res) => {
      if (req.url === '/jwks.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(jwks));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('JWKS server did not bind');
      const fileIssuer = `http://127.0.0.1:${address.port}`;
      const minted = mintRs256AccessToken({
        privateKeyPem: pem!,
        kid,
        issuer: fileIssuer,
        tenantId: 'tenant-file',
        userId: 'user-file',
        clientId: 'bookone-codex',
        connectionId: 'conn-file',
        scopes: ['read', 'upload', 'draft'],
      });
      const actor = await resolveActorFromAuthorization(`Bearer ${minted}`, 'hmac-unused', {
        AGENT_BRIDGE_OAUTH_ISSUER: fileIssuer,
        AGENT_BRIDGE_OAUTH_JWKS_URL: `${fileIssuer}/jwks.json`,
      });
      expect(actor).toMatchObject({ userId: 'user-file', tenantId: 'tenant-file', clientId: 'bookone-codex' });
      expect(actor.capabilities).toEqual(['read', 'upload', 'draft']);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});

