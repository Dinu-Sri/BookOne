export type ConnectionLifecycleKey = 'revoked' | 'authenticated' | 'token_issued' | 'granted';

export type ConnectionLifecycleInput = {
  revokedAt?: string | null;
  tokenIssuedAt?: string | null;
  lastUsedAt?: string | null;
};

export type ConnectionLifecycle = {
  key: ConnectionLifecycleKey;
  label: string;
  lastUsedLabel: string;
  countsAsAuthenticated: boolean;
  retryGuidance: string | null;
};

function stampLabel(iso: string | null | undefined): string {
  if (!iso) return 'Never used';
  return iso.slice(0, 16).replace('T', ' ');
}

const FRESH_AUTH_RETRY =
  'Retry with a fresh authorization in the client. Do not reuse a consumed authorization code.';

export function connectionLifecycle(row: ConnectionLifecycleInput): ConnectionLifecycle {
  if (row.revokedAt) {
    return {
      key: 'revoked',
      label: 'Revoked',
      lastUsedLabel: row.lastUsedAt ? stampLabel(row.lastUsedAt) : 'Never used',
      countsAsAuthenticated: false,
      retryGuidance: FRESH_AUTH_RETRY,
    };
  }
  if (row.lastUsedAt) {
    return {
      key: 'authenticated',
      label: 'Active',
      lastUsedLabel: stampLabel(row.lastUsedAt),
      countsAsAuthenticated: true,
      retryGuidance: null,
    };
  }
  if (row.tokenIssuedAt) {
    return {
      key: 'token_issued',
      label: 'Token issued',
      lastUsedLabel: 'Never used',
      countsAsAuthenticated: false,
      retryGuidance: `BookOne issued a token, but this client has not completed an authenticated request yet. ${FRESH_AUTH_RETRY}`,
    };
  }
  return {
    key: 'granted',
    label: 'Permission granted',
    lastUsedLabel: 'Never used',
    countsAsAuthenticated: false,
    retryGuidance: `Allow was recorded. This is not an authenticated client yet. ${FRESH_AUTH_RETRY}`,
  };
}

export type ConnectionCounts = {
  grantedOnly: number;
  tokenIssuedNeverUsed: number;
  authenticated: number;
  revoked: number;
};

export function summarizeConnectionLifecycle(rows: ConnectionLifecycleInput[]): ConnectionCounts {
  const counts: ConnectionCounts = {
    grantedOnly: 0,
    tokenIssuedNeverUsed: 0,
    authenticated: 0,
    revoked: 0,
  };
  for (const row of rows) {
    const life = connectionLifecycle(row);
    if (life.key === 'revoked') counts.revoked += 1;
    else if (life.key === 'authenticated') counts.authenticated += 1;
    else if (life.key === 'token_issued') counts.tokenIssuedNeverUsed += 1;
    else counts.grantedOnly += 1;
  }
  return counts;
}

export function pendingGrantForReuse<T extends ConnectionLifecycleInput & { clientId: string; userId: string; revokedAt?: string | null }>(
  rows: T[],
  args: { userId: string; clientId: string },
): T | undefined {
  return rows.find(
    (row) =>
      row.userId === args.userId &&
      row.clientId === args.clientId &&
      !row.revokedAt &&
      !row.tokenIssuedAt &&
      !row.lastUsedAt,
  );
}
