import { describe, expect, it } from 'vitest';
import { intersectCapabilities, parseScopes } from '../src/authz';

describe('independent acceptance expectations AB-04', () => {
  it('token scopes never expand a read-only token to post', () => {
    const live = parseScopes(['purchase.inbox.read', 'agent_bridge.approve', 'agent_bridge.post']);
    expect(intersectCapabilities(['read', 'post'], ['read'])).toEqual(['read']);
    expect(intersectCapabilities(['read', 'post'], live)).toEqual(['read', 'post']);
    expect(intersectCapabilities(['read'], live)).toEqual(['read']);
  });

  it('persisted .write aliases map to the same capabilities as catalog action keys', () => {
    expect(parseScopes(['agent_bridge.approve.write', 'agent_bridge.post.write'])).toEqual(['approve', 'post']);
    expect(parseScopes(['agent_bridge.approve', 'agent_bridge.post'])).toEqual(['approve', 'post']);
    expect(parseScopes(['agent_bridge.hack', 'unknown.write'])).toEqual([]);
  });
});
