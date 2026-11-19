import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MemoryAuthorizationCodeStore,
  createPkcePair,
  encodeTenantBoundCode,
  findPublicClient,
  loginCallbackFromSearch,
  oauthRequestUrl,
  oauthSearchParams,
  oauthSignInFromTarget,
  redirectUriAllowed,
  redirectUrisMatch,
  redeemStoredCode,
  renderConsentPage,
  resourceAllowed,
  safeOAuthDenialUrl,
  type AuthorizationCode,
} from '../src/index';

const requireFromWeb = createRequire(path.resolve(__dirname, '../../../apps/web/package.json'));
const { NextRequest } = requireFromWeb('next/dist/server/web/spec-extension/request.js') as {
  NextRequest: new (input: string | URL, init?: RequestInit) => Request & { nextUrl: URL; url: string };
};
const { NextResponse } = requireFromWeb('next/dist/server/web/spec-extension/response.js') as {
  NextResponse: { redirect(url: string | URL, init?: number): Response };
};

const ISSUER = 'https://bookone.clossyan.com';
const AUTHORIZE_PATH = '/api/agent-bridge/oauth/authorize';

function authorizeHref(redirectUri: string, extra: Record<string, string> = {}, pkce = createPkcePair()) {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: 'bookone-codex',
    redirect_uri: redirectUri,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    resource: `${ISSUER}/api/agent-bridge/mcp`,
    state: 'st-1',
    ...extra,
  });
  return { href: `${ISSUER}${AUTHORIZE_PATH}?${query}`, pkce, query };
}

function nextRequestFromNode(req: IncomingMessage): Request & { nextUrl: URL; url: string } {
  const target = req.url || '/';
  const url = target.startsWith('http') ? new URL(target) : new URL(target, ISSUER);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  return new NextRequest(url, { method: req.method, headers });
}

function hiddenValue(html: string, name: string): string {
  const match = html.match(new RegExp(`name="${name}" value="([^"]*)"`));
  return (match?.[1] ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('server did not bind'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

describe('AB-10 exact OAuth callback preservation through NextRequest', () => {
  it('reproduces NextURL rewriting nested 127.0.0.1 while the Fetch Request URL keeps it', () => {
    const callback = 'http://127.0.0.1:61241/callback/989kWVAG9tcl';
    const { href } = authorizeHref(callback);
    const request = new NextRequest(href);
    expect(new URL(href).searchParams.get('redirect_uri')).toBe(callback);
    expect(request.nextUrl.searchParams.get('redirect_uri')).toBe('http://localhost:61241/callback/989kWVAG9tcl');
    expect(new URL(request.url).searchParams.get('redirect_uri')).toBe('http://localhost:61241/callback/989kWVAG9tcl');
    expect(oauthSearchParams(request).get('redirect_uri')).toBe(callback);
    expect(oauthRequestUrl(request).searchParams.get('redirect_uri')).toBe(callback);
  });

  it('preserves localhost, encoded IPv6, and variable loopback ports/paths independently', () => {
    const cases = [
      'http://127.0.0.1:43111/callback/989kWVAG9tcl',
      'http://127.0.0.1:9/callback/abc',
      'http://localhost:61241/callback/example',
      'http://[::1]:61241/callback/example',
      'http://127.0.0.1:61241/callback/id-2?foo=bar',
    ];
    for (const callback of cases) {
      const request = new NextRequest(authorizeHref(callback).href);
      expect(oauthSearchParams(request).get('redirect_uri')).toBe(callback);
      expect(redirectUriAllowed(findPublicClient('bookone-codex')!, callback)).toBe(true);
    }
  });

  it('keeps exact host matching: a 127.0.0.1 code still rejects localhost', () => {
    const stored = 'http://127.0.0.1:61241/callback/989kWVAG9tcl';
    expect(redirectUrisMatch(stored, stored)).toBe(true);
    expect(redirectUrisMatch(stored, 'http://localhost:61241/callback/989kWVAG9tcl')).toBe(false);
    expect(redirectUrisMatch(stored, 'http://[::1]:61241/callback/989kWVAG9tcl')).toBe(false);
    expect(redirectUrisMatch(stored, 'http://127.0.0.1:9/callback/989kWVAG9tcl')).toBe(false);
  });

  it('carries the original nested callback through /login?from= Location and browser search', () => {
    const callback = 'http://127.0.0.1:61241/callback/989kWVAG9tcl';
    const { href } = authorizeHref(callback);
    const request = new NextRequest(href);
    const next = encodeURIComponent(oauthSignInFromTarget(request));
    const redirected = NextResponse.redirect(new URL(`/login?from=${next}`, oauthRequestUrl(request)));
    const location = redirected.headers.get('Location') ?? '';
    expect(location.includes('127.0.0.1')).toBe(true);
    const loginReq = new NextRequest(location);
    expect(String(loginReq.nextUrl.searchParams.get('from') ?? '')).toContain('localhost');
    expect(String(loginReq.nextUrl.searchParams.get('from') ?? '')).not.toContain('127.0.0.1');
    const browserFrom = new URL(location).search;
    const returned = loginCallbackFromSearch(browserFrom);
    expect(returned).toContain('127.0.0.1');
    expect(decodeURIComponent(returned)).toContain(callback);
  });
});

describe('AB-10 HTTP authorize GET form POST persist token through NextRequest', () => {
  let server: Server;
  let origin = '';
  const store = new MemoryAuthorizationCodeStore();

  beforeAll(async () => {
    server = createServer((req, res) => {
      const nextReq = nextRequestFromNode(req);
      const cookies = req.headers.cookie ?? '';
      const authed = /bookone-session=1/.test(cookies);

      const send = (status: number, body: string, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
        res.end(body);
      };

      if ((req.url || '').startsWith(AUTHORIZE_PATH) && req.method === 'GET') {
        if (!authed) {
          const next = encodeURIComponent(oauthSignInFromTarget(nextReq));
          const login = new URL(`/login?from=${next}`, oauthRequestUrl(nextReq));
          send(307, '', { location: login.toString() });
          return;
        }
        const params = oauthSearchParams(nextReq);
        const clientId = params.get('client_id') ?? '';
        const redirectUri = params.get('redirect_uri') ?? '';
        const resource = params.get('resource') ?? '';
        const method = params.get('code_challenge_method') ?? '';
        const challenge = params.get('code_challenge') ?? '';
        const client = findPublicClient(clientId);
        if (!client) {
          send(400, renderConsentPage({ kind: 'invalid_request', message: 'Unknown client.' }));
          return;
        }
        if (!redirectUriAllowed(client, redirectUri)) {
          send(400, renderConsentPage({ kind: 'untrusted_redirect', clientName: client.clientName }));
          return;
        }
        if (!resourceAllowed(ISSUER, resource) || method !== 'S256' || challenge.length < 43) {
          send(400, renderConsentPage({ kind: 'invalid_request', clientName: client.clientName }));
          return;
        }
        send(
          200,
          renderConsentPage({
            kind: 'consent',
            clientName: client.clientName,
            companyName: 'Demo company',
            accountName: 'Owner',
            accountEmail: 'owner@example.com',
            flags: { enabled: true, draftOnly: false, postingDisabled: true },
            fields: {
              client_id: clientId,
              redirect_uri: redirectUri,
              state: params.get('state') ?? '',
              code_challenge: challenge,
              code_challenge_method: method,
              resource,
              scope: 'read upload draft',
            },
          }),
        );
        return;
      }

      if ((req.url || '').startsWith(AUTHORIZE_PATH) && req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk as Buffer));
        req.on('end', () => {
          const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
          const clientId = form.get('client_id') ?? '';
          const redirectUri = form.get('redirect_uri') ?? '';
          const state = form.get('state') ?? '';
          const challenge = form.get('code_challenge') ?? '';
          const decision = form.get('decision') ?? 'allow';
          const client = findPublicClient(clientId);
          if (!client || !redirectUriAllowed(client, redirectUri)) {
            send(400, renderConsentPage({ kind: 'untrusted_redirect' }));
            return;
          }
          if (decision === 'deny') {
            const denial = safeOAuthDenialUrl(clientId, redirectUri, { state, issuer: ISSUER });
            send(302, '', { location: denial ?? '/' });
            return;
          }
          const row: AuthorizationCode = {
            code: encodeTenantBoundCode('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
            tenantId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            userId: 'user-a',
            clientId,
            redirectUri,
            codeChallenge: challenge,
            codeChallengeMethod: 'S256',
            scopes: ['read', 'upload', 'draft'],
            connectionId: 'conn-1',
            expiresAt: Date.now() + 60_000,
          };
          void store.saveCode(row).then(() => {
            const callback = new URL(redirectUri);
            callback.searchParams.set('code', row.code);
            if (state) callback.searchParams.set('state', state);
            callback.searchParams.set('iss', ISSUER);
            send(302, '', { location: callback.toString() });
          });
        });
        return;
      }

      if ((req.url || '').startsWith('/api/agent-bridge/oauth/token') && req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk as Buffer));
        req.on('end', () => {
          const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
          const code = form.get('code') ?? '';
          const result = redeemStoredCode(
            {
              get: (value) => store.peekCode(value),
              set: (_value, row) => store.replaceCode(row as AuthorizationCode),
            },
            code,
            {
              clientId: form.get('client_id') ?? '',
              redirectUri: form.get('redirect_uri') ?? '',
              codeVerifier: form.get('code_verifier') ?? '',
            },
          );
          if (!result.ok) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_grant' }));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ token_type: 'Bearer', access_token: 'issued' }));
        });
        return;
      }

      if ((req.url || '').startsWith('/login') && req.method === 'GET') {
        const href = `${ISSUER}${req.url}`;
        const browser = loginCallbackFromSearch(new URL(href).search);
        send(200, `<p>signed-in</p><a href="${browser}">continue</a>`);
        return;
      }

      send(404, 'not found');
    });
    origin = await listen(server);
  });

  afterAll(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!server) return resolve();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  it('issues a token for the original 127.0.0.1 callback and refuses localhost redemption', async () => {
    const callback = 'http://127.0.0.1:61241/callback/989kWVAG9tcl';
    const { href, pkce, query } = authorizeHref(callback);
    const pathAndQuery = new URL(href).pathname + new URL(href).search;

    const unauth = await fetch(`${origin}${pathAndQuery}`, { redirect: 'manual' });
    expect(unauth.status).toBe(307);
    const loginLocation = unauth.headers.get('location') ?? '';
    expect(loginLocation).toContain('/login?from=');
    expect(decodeURIComponent(new URL(loginLocation).searchParams.get('from') ?? '')).toContain('127.0.0.1');

    const loginPage = await fetch(loginLocation.replace(ISSUER, origin), { redirect: 'manual' });
    const loginHtml = await loginPage.text();
    expect(loginHtml).toContain('127.0.0.1');

    const consent = await fetch(`${origin}${pathAndQuery}`, { headers: { cookie: 'bookone-session=1' } });
    expect(consent.status).toBe(200);
    const html = await consent.text();
    expect(hiddenValue(html, 'redirect_uri')).toBe(callback);
    expect(html).toMatch(/Allow Codex to connect to BookOne/);

    const form = new URLSearchParams({
      client_id: hiddenValue(html, 'client_id'),
      redirect_uri: hiddenValue(html, 'redirect_uri'),
      state: hiddenValue(html, 'state'),
      code_challenge: hiddenValue(html, 'code_challenge'),
      code_challenge_method: hiddenValue(html, 'code_challenge_method'),
      resource: hiddenValue(html, 'resource'),
      decision: 'allow',
    });
    const allowed = await fetch(`${origin}${AUTHORIZE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: 'bookone-session=1' },
      body: form,
      redirect: 'manual',
    });
    expect(allowed.status).toBe(302);
    const callbackLocation = allowed.headers.get('location') ?? '';
    expect(callbackLocation.startsWith(callback)).toBe(true);
    const code = new URL(callbackLocation).searchParams.get('code') ?? '';
    expect(code.length).toBeGreaterThan(8);

    const wrongHost = await fetch(`${origin}/api/agent-bridge/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'bookone-codex',
        code,
        redirect_uri: 'http://localhost:61241/callback/989kWVAG9tcl',
        code_verifier: pkce.verifier,
      }),
    });
    expect(wrongHost.status).toBe(400);
    expect(await wrongHost.json()).toEqual({ error: 'invalid_grant' });
    expect(store.peekCode(code)?.usedAt).toBeFalsy();

    const token = await fetch(`${origin}/api/agent-bridge/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'bookone-codex',
        code,
        redirect_uri: callback,
        code_verifier: pkce.verifier,
      }),
    });
    expect(token.status).toBe(200);
    expect((await token.json()).access_token).toBe('issued');

    const reused = await fetch(`${origin}/api/agent-bridge/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'bookone-codex',
        code,
        redirect_uri: callback,
        code_verifier: pkce.verifier,
      }),
    });
    expect(reused.status).toBe(400);

    expect(query.get('redirect_uri')).toBe(callback);
  });

  it('cancels to the original loopback host and refuses an untrusted redirect', async () => {
    const callback = 'http://127.0.0.1:43111/callback/abc';
    const { href, pkce } = authorizeHref(callback);
    const pathAndQuery = new URL(href).pathname + new URL(href).search;
    const consent = await fetch(`${origin}${pathAndQuery}`, { headers: { cookie: 'bookone-session=1' } });
    const html = await consent.text();
    const cancel = await fetch(`${origin}${AUTHORIZE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: 'bookone-session=1' },
      body: new URLSearchParams({
        client_id: 'bookone-codex',
        redirect_uri: hiddenValue(html, 'redirect_uri'),
        state: 'st-1',
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        decision: 'deny',
      }),
      redirect: 'manual',
    });
    expect(cancel.status).toBe(302);
    const denial = cancel.headers.get('location') ?? '';
    expect(denial.startsWith(callback)).toBe(true);
    expect(denial).toContain('error=access_denied');

    const evil = await fetch(
      `${origin}${AUTHORIZE_PATH}?${new URLSearchParams({
        client_id: 'bookone-codex',
        redirect_uri: 'https://evil.example/callback',
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        resource: `${ISSUER}/api/agent-bridge/mcp`,
      })}`,
      { headers: { cookie: 'bookone-session=1' } },
    );
    expect(evil.status).toBe(400);
    expect(await evil.text()).not.toMatch(/evil\.example/);
  });

  it('refuses a wrong verifier after persist and does not alias hosts', async () => {
    const callback = 'http://localhost:61241/callback/local-only';
    const { href, pkce } = authorizeHref(callback);
    const pathAndQuery = new URL(href).pathname + new URL(href).search;
    const consent = await fetch(`${origin}${pathAndQuery}`, { headers: { cookie: 'bookone-session=1' } });
    const html = await consent.text();
    expect(hiddenValue(html, 'redirect_uri')).toBe(callback);
    const allowed = await fetch(`${origin}${AUTHORIZE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: 'bookone-session=1' },
      body: new URLSearchParams({
        client_id: 'bookone-codex',
        redirect_uri: hiddenValue(html, 'redirect_uri'),
        state: 'st-1',
        code_challenge: hiddenValue(html, 'code_challenge'),
        code_challenge_method: 'S256',
        decision: 'allow',
      }),
      redirect: 'manual',
    });
    const code = new URL(allowed.headers.get('location') ?? '').searchParams.get('code') ?? '';
    const badVerifier = await fetch(`${origin}/api/agent-bridge/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'bookone-codex',
        code,
        redirect_uri: callback,
        code_verifier: 'wrong-verifier-value-that-is-long-enough-xx',
      }),
    });
    expect(badVerifier.status).toBe(400);
    expect(store.peekCode(code)?.usedAt).toBeTruthy();
    const asIpv4 = await fetch(`${origin}/api/agent-bridge/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'bookone-codex',
        code,
        redirect_uri: 'http://127.0.0.1:61241/callback/local-only',
        code_verifier: pkce.verifier,
      }),
    });
    expect(asIpv4.status).toBe(400);
  });
});
