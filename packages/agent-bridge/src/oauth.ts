import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { CAPABILITIES, DEFAULT_CONNECTION_SCOPES, type Capability } from './contracts';
import { TOKEN_AUDIENCE } from './authz';

export const OAUTH_CODE_TTL_MS = 10 * 60 * 1000;
export const UPLOAD_SESSION_TTL_MS = 30 * 60 * 1000;
export const PKCE_METHODS = ['S256'] as const;

export type PkcePair = { verifier: string; challenge: string; method: 'S256' };

export type AuthorizationCode = {
  code: string;
  tenantId: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  scopes: Capability[];
  connectionId: string;
  expiresAt: number;
  usedAt?: number;
};

export type OAuthClientRegistration = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: 'none';
};

export const PUBLIC_MCP_CLIENTS: OAuthClientRegistration[] = [
  {
    clientId: 'bookone-codex',
    clientName: 'Codex',
    redirectUris: [
      'http://127.0.0.1/callback',
      'http://localhost/callback',
      'https://chatgpt.com/connector/oauth/callback',
    ],
    tokenEndpointAuthMethod: 'none',
  },
  {
    clientId: 'bookone-claude',
    clientName: 'Claude',
    redirectUris: [
      'http://127.0.0.1/callback',
      'http://localhost/callback',
      'https://claude.ai/api/mcp/auth_callback',
    ],
    tokenEndpointAuthMethod: 'none',
  },
];

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}

export function verifyPkce(verifier: string, challenge: string, method = 'S256'): boolean {
  if (method !== 'S256') return false;
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  const expected = createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newAuthorizationCode(): string {
  return randomBytes(24).toString('base64url');
}

/** Tenant is encoded in the code so token exchange does not need a custom tenant_id field. */
export function encodeTenantBoundCode(tenantId: string, kind: 'code' | 'refresh' = 'code'): string {
  const tenantPart = Buffer.from(tenantId, 'utf8').toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  return kind === 'refresh' ? `rt.${tenantPart}.${nonce}` : `${tenantPart}.${nonce}`;
}

export function tenantIdFromBoundToken(value: string): string | null {
  const raw = value.startsWith('rt.') ? value.slice(3) : value;
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  try {
    const tenantId = Buffer.from(raw.slice(0, dot), 'base64url').toString('utf8');
    return tenantId.trim() ? tenantId : null;
  } catch {
    return null;
  }
}

export function isRefreshTokenValue(value: string): boolean {
  return value.startsWith('rt.');
}

/** Consent always grants read/upload/draft. Post is never minted through this AS. */
export function consentConnectionScopes(): Capability[] {
  return [...DEFAULT_CONNECTION_SCOPES];
}

export function parseRequestedScopes(raw: string | undefined): Capability[] {
  if (!raw || !raw.trim()) return [...DEFAULT_CONNECTION_SCOPES];
  const asked = raw.split(/[\s,]+/).filter(Boolean);
  const out = new Set<Capability>();
  for (const item of asked) {
    if ((CAPABILITIES as readonly string[]).includes(item)) out.add(item as Capability);
    if (item === 'purchase.inbox.read') out.add('read');
    if (item === 'purchase.inbox.write') {
      out.add('read');
      out.add('upload');
      out.add('draft');
    }
    if (item === 'agent_bridge.post' || item === 'agent_bridge.post.write') out.add('post');
  }
  out.delete('approve');
  if (!out.has('read')) out.add('read');
  return [...out];
}

export function redirectUriAllowed(client: OAuthClientRegistration, uri: string): boolean {
  if (client.redirectUris.includes(uri)) return true;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
      return parsed.pathname === '/callback' || parsed.pathname.endsWith('/callback');
    }
  } catch {
    return false;
  }
  return false;
}

export function findPublicClient(clientId: string): OAuthClientRegistration | undefined {
  return PUBLIC_MCP_CLIENTS.find((c) => c.clientId === clientId);
}

export function protectedResourceMetadata(resource: string, authorizationServers: string[]) {
  const base = resource.replace(/\/$/, '');
  const docs = /^https?:\/\//i.test(base) ? `${base}/docs/AGENT_BRIDGE.md` : undefined;
  return {
    resource: base,
    authorization_servers: authorizationServers,
    bearer_methods_supported: ['header'],
    scopes_supported: [...DEFAULT_CONNECTION_SCOPES, 'post'],
    resource_documentation: docs,
    mcp_endpoint: /^https?:\/\//i.test(base) ? `${base}/api/agent-bridge/mcp` : undefined,
  };
}

/** RFC 9728 challenge so MCP clients can discover the authorization server. */
export function wwwAuthenticateChallenge(origin: string, extra?: { error?: string; description?: string }): string {
  const base = origin.replace(/\/$/, '');
  const parts = [
    `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    `scope="${DEFAULT_CONNECTION_SCOPES.join(' ')}"`,
  ];
  if (extra?.error) parts.push(`error="${extra.error}"`);
  if (extra?.description) parts.push(`error_description="${extra.description.replaceAll('"', "'")}"`);
  return parts.join(', ');
}

export function authorizationServerMetadata(issuer: string) {
  const base = issuer.replace(/\/$/, '');
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/agent-bridge/oauth/authorize`,
    token_endpoint: `${base}/api/agent-bridge/oauth/token`,
    revocation_endpoint: `${base}/api/agent-bridge/oauth/revoke`,
    jwks_uri: `${base}/api/agent-bridge/oauth/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...DEFAULT_CONNECTION_SCOPES],
    resource: TOKEN_AUDIENCE,
  };
}

export interface AuthorizationCodeStore {
  saveCode(code: AuthorizationCode): Promise<void>;
  takeCode(code: string): Promise<AuthorizationCode | null>;
}

export class MemoryAuthorizationCodeStore implements AuthorizationCodeStore {
  private codes = new Map<string, AuthorizationCode>();
  async saveCode(code: AuthorizationCode) {
    this.codes.set(code.code, code);
  }
  async takeCode(code: string) {
    const row = this.codes.get(code) ?? null;
    if (!row) return null;
    if (row.usedAt) return null;
    row.usedAt = Date.now();
    this.codes.set(code, row);
    return row;
  }
}
