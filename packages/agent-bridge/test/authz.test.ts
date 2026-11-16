import { describe, expect, it } from 'vitest';
import {
  actorFromToken,
  mintLocalFixtureToken,
  parseScopes,
  verifyConnectionToken,
} from '../src/authz';

const secret = 'test-agent-bridge-secret';

describe('local fixture tokens', () => {
  it('parses inbox and approve/post scopes', () => {
    expect(parseScopes(['purchase.inbox.read'])).toEqual(['read']);
    expect(parseScopes(['purchase.inbox.write'])).toEqual(['read', 'upload', 'draft']);
    expect(parseScopes(['agent_bridge.approve', 'agent_bridge.post'])).toEqual(['approve', 'post']);
  });

  it('rejects expired, wrong-secret and malformed tokens', () => {
    const token = mintLocalFixtureToken({
      tenantId: 't1',
      userId: 'u1',
      scopes: ['read'],
      secret,
      hours: 1,
    });
    const ok = verifyConnectionToken(token, secret);
    expect(actorFromToken(ok).tenantId).toBe('t1');
    expect(() => verifyConnectionToken(token, 'other')).toThrow(/signature/);
    expect(() => verifyConnectionToken('nope', secret)).toThrow(/malformed/);
    expect(() => verifyConnectionToken(token, secret, Date.now() + 9 * 3600_000)).toThrow(/expired/);
  });
});
