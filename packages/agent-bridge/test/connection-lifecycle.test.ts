import { describe, expect, it } from 'vitest';
import {
  connectionLifecycle,
  pendingGrantForReuse,
  summarizeConnectionLifecycle,
} from '../src/connection-lifecycle';
import { connectedClientsReadiness } from '../src/connection-prompts';

describe('AB-09 connection lifecycle', () => {
  it('does not call a consent-only row an authenticated client', () => {
    const granted = connectionLifecycle({});
    expect(granted.key).toBe('granted');
    expect(granted.label).toBe('Permission granted');
    expect(granted.countsAsAuthenticated).toBe(false);
    expect(granted.lastUsedLabel).toBe('Never used');
    expect(granted.retryGuidance).toMatch(/fresh authorization/i);
  });

  it('treats token issuance without MCP use as never-used, not active', () => {
    const issued = connectionLifecycle({ tokenIssuedAt: '2026-11-18T10:00:00.000Z' });
    expect(issued.key).toBe('token_issued');
    expect(issued.label).toBe('Token issued');
    expect(issued.countsAsAuthenticated).toBe(false);
    expect(issued.lastUsedLabel).toBe('Never used');
  });

  it('counts authenticated only after lastUsedAt from an MCP request', () => {
    const active = connectionLifecycle({
      tokenIssuedAt: '2026-11-18T10:00:00.000Z',
      lastUsedAt: '2026-11-18T10:05:00.000Z',
    });
    expect(active.key).toBe('authenticated');
    expect(active.label).toBe('Active');
    expect(active.countsAsAuthenticated).toBe(true);
    expect(active.lastUsedLabel).toMatch(/2026-11-18 10:05/);
  });

  it('summarizes mixed rows and reuses a pending grant for the same user and client', () => {
    const rows = [
      { userId: 'u1', clientId: 'bookone-codex' },
      { userId: 'u1', clientId: 'bookone-codex', tokenIssuedAt: '2026-11-18T10:00:00.000Z' },
      { userId: 'u1', clientId: 'bookone-codex', lastUsedAt: '2026-11-18T10:05:00.000Z' },
      { userId: 'u1', clientId: 'bookone-codex', revokedAt: '2026-11-18T11:00:00.000Z' },
    ];
    const counts = summarizeConnectionLifecycle(rows);
    expect(counts).toEqual({
      grantedOnly: 1,
      tokenIssuedNeverUsed: 1,
      authenticated: 1,
      revoked: 1,
    });
    const pending = pendingGrantForReuse(rows, { userId: 'u1', clientId: 'bookone-codex' });
    expect(pending).toBe(rows[0]);
    expect(pendingGrantForReuse(rows.slice(1), { userId: 'u1', clientId: 'bookone-codex' })).toBeUndefined();
  });

  it('readiness copy never says authenticated for consent-only grants', () => {
    expect(connectedClientsReadiness(0).detail).toMatch(/does not itself connect/i);
    const pending = connectedClientsReadiness(0, { grantedOnly: 1 });
    expect(pending.level).toBe('setup_needed');
    expect(pending.detail).not.toMatch(/1 authenticated client/);
    expect(pending.detail).toMatch(/None of these are authenticated clients yet/);
    expect(connectedClientsReadiness(1).detail).toBe('1 authenticated client.');
  });
});
