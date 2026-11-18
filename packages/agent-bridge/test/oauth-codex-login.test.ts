import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MemoryAuthorizationCodeStore,
  authorizationCallbackUrl,
  authorizationServerMetadata,
  consentConnectionScopes,
  createPkcePair,
  findPublicClient,
  followMcpOauthDiscovery,
  protectedResourceMetadata,
  redirectUriAllowed,
  resourceAllowed,
  verifyPkce,
  wwwAuthenticateChallenge,
  type AuthorizationCode,
} from '../src/oauth';
import { renderConsentPage } from '../src/consent-page';

const root = path.resolve(__dirname, '../../..');

function readRepo(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('AB-07 Codex login discovery and callback', () => {
  let server: Server;
  let origin = '';

  beforeAll(async () => {
    server = createServer((req, res) => {
      const host = req.headers.host || '127.0.0.1';
      const url = new URL(req.url || '/', `http://${host}`);
      const base = `http://${host}`;
      if (url.pathname === '/api/agent-bridge/mcp' && req.method === 'POST') {
        req.resume();
        req.on('end', () => {
          res.writeHead(401, {
            'content-type': 'application/json',
            'www-authenticate': wwwAuthenticateChallenge(base, {
              error: 'invalid_request',
              description: 'Missing Bearer token.',
            }),
          });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing Bearer token.' } }));
        });
        return;
      }
      if (
        url.pathname === '/.well-known/oauth-protected-resource' ||
        url.pathname === '/.well-known/oauth-protected-resource/api/agent-bridge/mcp' ||
        url.pathname === '/api/agent-bridge/mcp/.well-known/oauth-protected-resource'
      ) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(protectedResourceMetadata(base, [base])));
        return;
      }
      if (
        url.pathname === '/.well-known/oauth-authorization-server' ||
        url.pathname.startsWith('/.well-known/oauth-authorization-server/')
      ) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(authorizationServerMetadata(base)));
        return;
      }
      if (url.pathname === '/api/agent-bridge/oauth/authorize' || url.pathname === '/authorize') {
        const clientId = url.searchParams.get('client_id') ?? '';
        const redirectUri = url.searchParams.get('redirect_uri') ?? '';
        const resource = url.searchParams.get('resource') ?? '';
        const method = url.searchParams.get('code_challenge_method') ?? '';
        const challenge = url.searchParams.get('code_challenge') ?? '';
        const client = findPublicClient(clientId);
        if (!client) {
          res.writeHead(400, { 'content-type': 'text/html' });
          res.end('<p>Unknown client. Use bookone-codex or bookone-claude.</p>');
          return;
        }
        if (!redirectUriAllowed(client, redirectUri) || !resourceAllowed(base, resource) || method !== 'S256' || challenge.length < 43) {
          res.writeHead(400, { 'content-type': 'text/html' });
          res.end('<p>Consent request is invalid.</p>');
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          renderConsentPage({
            kind: 'consent',
            clientName: client.clientName,
            companyName: 'Demo company',
            accountName: 'Owner',
            accountEmail: 'owner@example.com',
            flags: { enabled: true, draftOnly: true, postingDisabled: true },
            fields: {
              client_id: clientId,
              redirect_uri: redirectUri,
              state: '',
              code_challenge: challenge,
              code_challenge_method: method,
              resource,
              scope: 'read upload draft',
            },
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end('not found');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('discovery server did not bind');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!server) return resolve();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  it('discovers the implemented authorize URL over HTTP instead of falling back to /authorize', async () => {
    const discovered = await followMcpOauthDiscovery(`${origin}/api/agent-bridge/mcp`);
    expect(discovered.mcpStatus).toBe(401);
    expect(discovered.wwwAuthenticate).toContain('resource_metadata=');
    expect(discovered.authorizationEndpoint).toBe(`${origin}/api/agent-bridge/oauth/authorize`);
    expect(discovered.tokenEndpoint).toBe(`${origin}/api/agent-bridge/oauth/token`);
    expect(discovered.issuer).toBe(origin);
  });

  it('serves consent for the discovered authorize URL and the issuer /authorize alias', async () => {
    const pkce = createPkcePair();
    const redirect = 'http://127.0.0.1:43111/callback/989kWVAG9tcl';
    const resource = `${origin}/api/agent-bridge/mcp`;
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: 'bookone-codex',
      redirect_uri: redirect,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      scope: 'read upload draft',
      resource,
    });
    const discovered = await followMcpOauthDiscovery(`${origin}/api/agent-bridge/mcp`);
    const consent = await fetch(`${discovered.authorizationEndpoint}?${query}`);
    expect(consent.status).toBe(200);
    const body = await consent.text();
    expect(body).toMatch(/Connect Codex to BookOne/);
    expect(body).toMatch(/read, upload and draft/);
    expect(body).toMatch(/Allow connection/);
    expect(body).toMatch(/Allow Codex to connect to BookOne/);
    const alias = await fetch(`${origin}/authorize?${query}`);
    expect(alias.status).toBe(200);
    expect(await alias.text()).toMatch(/Allow connection/);
  });

  it('refuses wrong client, redirect, resource and PKCE', async () => {
    const pkce = createPkcePair();
    const good = new URLSearchParams({
      response_type: 'code',
      client_id: 'bookone-codex',
      redirect_uri: 'http://127.0.0.1:9/callback/abc',
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      resource: `${origin}/api/agent-bridge/mcp`,
    });
    const unknown = await fetch(`${origin}/api/agent-bridge/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(good), client_id: 'not-a-client' })}`);
    expect(unknown.status).toBe(400);
    const evilRedirect = await fetch(
      `${origin}/api/agent-bridge/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(good), redirect_uri: 'https://evil.example/callback' })}`,
    );
    expect(evilRedirect.status).toBe(400);
    const evilResource = await fetch(
      `${origin}/api/agent-bridge/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(good), resource: 'https://evil.example/api/agent-bridge/mcp' })}`,
    );
    expect(evilResource.status).toBe(400);
    const noPkce = await fetch(
      `${origin}/api/agent-bridge/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(good), code_challenge_method: 'plain' })}`,
    );
    expect(noPkce.status).toBe(400);
  });

  it('exchanges a one-time PKCE code and refuses reuse, expiry and a wrong verifier', async () => {
    const pkce = createPkcePair();
    const store = new MemoryAuthorizationCodeStore();
    const row: AuthorizationCode = {
      code: 'tenant.nonce',
      tenantId: 'tenant-a',
      userId: 'user-a',
      clientId: 'bookone-codex',
      redirectUri: 'http://127.0.0.1:9/callback/abc',
      codeChallenge: pkce.challenge,
      codeChallengeMethod: 'S256',
      scopes: consentConnectionScopes(),
      connectionId: 'conn-1',
      expiresAt: Date.now() + 60_000,
    };
    await store.saveCode(row);
    expect(verifyPkce(pkce.verifier, pkce.challenge)).toBe(true);
    expect(verifyPkce('wrong-verifier-value-that-is-long-enough-xx', pkce.challenge)).toBe(false);
    const first = await store.takeCode(row.code);
    expect(first?.code).toBe(row.code);
    expect(await store.takeCode(row.code)).toBeNull();
    const expired: AuthorizationCode = {
      code: 'tenant.expired',
      tenantId: 'tenant-a',
      userId: 'user-a',
      clientId: 'bookone-codex',
      redirectUri: row.redirectUri,
      codeChallenge: pkce.challenge,
      codeChallengeMethod: 'S256',
      scopes: consentConnectionScopes(),
      connectionId: 'conn-1',
      expiresAt: Date.now() - 1,
    };
    await store.saveCode(expired);
    const taken = await store.takeCode(expired.code);
    expect(taken).toBeTruthy();
    expect(taken!.expiresAt).toBeLessThan(Date.now());
    const callback = authorizationCallbackUrl(row.redirectUri, {
      code: row.code,
      state: 's1',
      issuer: 'https://bookone.clossyan.com',
    });
    expect(callback).toContain('iss=https%3A%2F%2Fbookone.clossyan.com');
    expect(callback).toContain('code=tenant.nonce');
  });

  it('keeps middleware from sending Codex discovery to login', () => {
    const middleware = readRepo('apps/web/src/middleware.ts');
    expect(middleware).toMatch(/pathname === '\/authorize'/);
    expect(middleware).toMatch(/\/\.well-known\//);
    expect(middleware).toMatch(/\/api\/agent-bridge\//);
    const alias = readRepo('apps/web/src/app/authorize/route.ts');
    expect(alias).toMatch(/api\/agent-bridge\/oauth\/authorize/);
    const authorize = readRepo('apps/web/src/app/api/agent-bridge/oauth/authorize/route.ts');
    expect(authorize).toMatch(/authorizationCallbackUrl/);
    expect(authorize).toMatch(/resourceAllowed/);
    expect(authorize).toMatch(/url\.pathname\}\$\{url\.search\}/);
  });

  it('accepts the observed Codex loopback callback and rejects other hosts', () => {
    const codex = findPublicClient('bookone-codex')!;
    expect(redirectUriAllowed(codex, 'http://127.0.0.1/callback/989kWVAG9tcl')).toBe(true);
    expect(resourceAllowed('https://bookone.clossyan.com', 'https://bookone.clossyan.com/api/agent-bridge/mcp')).toBe(
      true,
    );
    expect(resourceAllowed('https://bookone.clossyan.com', 'https://evil.example/api/agent-bridge/mcp')).toBe(false);
  });
});
