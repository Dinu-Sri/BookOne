import { createServer, type Server } from 'node:http';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  mintLocalFixtureToken,
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
});
