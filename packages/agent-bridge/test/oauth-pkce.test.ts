import { describe, expect, it } from 'vitest';
import {
  authorizationServerMetadata,
  createPkcePair,
  parseRequestedScopes,
  protectedResourceMetadata,
  redirectUriAllowed,
  findPublicClient,
  verifyPkce,
  wwwAuthenticateChallenge,
} from '../src/oauth';
import { hmacFixturesAllowed, mintLocalFixtureToken, resolveActorFromAuthorization } from '../src/authz';

describe('OAuth PKCE and discovery', () => {
  it('round-trips S256 PKCE and rejects a wrong verifier', () => {
    const pair = createPkcePair();
    expect(verifyPkce(pair.verifier, pair.challenge)).toBe(true);
    expect(verifyPkce('totally-wrong-verifier-value-that-is-long-enough', pair.challenge)).toBe(false);
  });

  it('defaults new connections to read/upload/draft and drops approve', () => {
    expect(parseRequestedScopes(undefined)).toEqual(['read', 'upload', 'draft']);
    expect(parseRequestedScopes('read upload draft approve post')).toEqual(['read', 'upload', 'draft', 'post']);
  });

  it('publishes protected-resource and authorization-server metadata', () => {
    const resource = protectedResourceMetadata('https://bookone.example', ['https://bookone.example']);
    expect(resource.authorization_servers).toEqual(['https://bookone.example']);
    expect(resource.mcp_endpoint).toBe('https://bookone.example/api/agent-bridge/mcp');
    const as = authorizationServerMetadata('https://bookone.example');
    expect(as.code_challenge_methods_supported).toEqual(['S256']);
    expect(as.authorization_endpoint).toMatch(/\/api\/agent-bridge\/oauth\/authorize$/);
    expect(wwwAuthenticateChallenge('https://bookone.example')).toContain(
      'resource_metadata="https://bookone.example/.well-known/oauth-protected-resource"',
    );
  });

  it('allows documented public clients and localhost callbacks', () => {
    const codex = findPublicClient('bookone-codex');
    expect(codex).toBeTruthy();
    expect(redirectUriAllowed(codex!, 'http://127.0.0.1:1455/callback')).toBe(true);
    expect(redirectUriAllowed(codex!, 'https://evil.example/callback')).toBe(false);
  });

  it('refuses HMAC fixtures in production unless explicitly labelled', async () => {
    const token = mintLocalFixtureToken({
      tenantId: 't1',
      userId: 'u1',
      scopes: ['read'],
      secret: 's',
    });
    expect(hmacFixturesAllowed({ NODE_ENV: 'production' })).toBe(false);
    await expect(
      resolveActorFromAuthorization(`Bearer ${token}`, 's', { NODE_ENV: 'production' }),
    ).rejects.toThrow(/HMAC fixtures are disabled/);
    const actor = await resolveActorFromAuthorization(`Bearer ${token}`, 's', {
      NODE_ENV: 'production',
      AGENT_BRIDGE_ALLOW_HMAC: '1',
    });
    expect(actor.tenantId).toBe('t1');
  });
});
