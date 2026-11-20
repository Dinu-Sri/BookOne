import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { CAPABILITIES, DEFAULT_CONNECTION_SCOPES, type Capability } from './contracts';
import { oauthIssuer, TOKEN_AUDIENCE, type OAuthEnv } from './authz';

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
    if (item === 'agent_bridge.commerce_read' || item === 'commerce_read') out.add('commerce_read');
    if (item === 'agent_bridge.commerce_propose' || item === 'commerce_propose') {
      out.add('commerce_read');
      out.add('commerce_propose');
    }
  }
  out.delete('approve');
  if (!out.has('read')) out.add('read');
  return [...out];
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1';
}

/** Codex CLI uses /callback or /callback/<ephemeral-id> on a loopback port. */
export function isLoopbackCallbackPath(pathname: string): boolean {
  if (pathname === '/callback') return true;
  return /^\/callback\/[A-Za-z0-9_-]{1,128}$/.test(pathname);
}

export function redirectUriAllowed(client: OAuthClientRegistration, uri: string): boolean {
  if (client.redirectUris.includes(uri)) return true;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (!isLoopbackHostname(parsed.hostname)) return false;
    return isLoopbackCallbackPath(parsed.pathname);
  } catch {
    return false;
  }
}

export function mcpResourceUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/agent-bridge/mcp`;
}

export function protectedResourceMetadataPath(origin: string): string {
  return `${origin.replace(/\/$/, '')}/.well-known/oauth-protected-resource/api/agent-bridge/mcp`;
}

export function resourceAllowed(origin: string, resource: string): boolean {
  if (!resource.trim()) return true;
  const base = origin.replace(/\/$/, '');
  return resource === mcpResourceUrl(base) || resource === base || resource === TOKEN_AUDIENCE;
}

export function authorizationCallbackUrl(
  redirectUri: string,
  args: { code: string; state?: string; issuer: string },
): string {
  const next = new URL(redirectUri);
  next.searchParams.set('code', args.code);
  if (args.state) next.searchParams.set('state', args.state);
  next.searchParams.set('iss', args.issuer.replace(/\/$/, ''));
  return next.toString();
}

export function parseWwwAuthenticateResourceMetadata(header: string): string | null {
  const match = header.match(/resource_metadata="([^"]+)"/i);
  return match?.[1] ?? null;
}

/** Codex-style MCP OAuth discovery: 401 WWW-Authenticate → PRM → AS metadata. */
export async function followMcpOauthDiscovery(
  mcpUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  mcpStatus: number;
  wwwAuthenticate: string | null;
  resourceMetadataUrl: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
}> {
  const mcp = await fetchImpl(mcpUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'bookone-discovery', version: '0' },
      },
    }),
    redirect: 'manual',
  });
  if (mcp.status !== 401) {
    throw new Error(`MCP discovery expected 401, got ${mcp.status}`);
  }
  const wwwAuthenticate = mcp.headers.get('www-authenticate');
  const resourceMetadataUrl = wwwAuthenticate ? parseWwwAuthenticateResourceMetadata(wwwAuthenticate) : null;
  if (!resourceMetadataUrl) throw new Error('WWW-Authenticate resource_metadata is missing');
  const prmRes = await fetchImpl(resourceMetadataUrl, { redirect: 'manual' });
  if (!prmRes.ok) throw new Error(`Protected resource metadata HTTP ${prmRes.status}`);
  const prm = (await prmRes.json()) as { authorization_servers?: string[]; resource?: string };
  const issuer = prm.authorization_servers?.[0];
  if (!issuer) throw new Error('authorization_servers is missing');
  const asUrl = `${issuer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;
  const asRes = await fetchImpl(asUrl, { redirect: 'manual' });
  if (!asRes.ok) throw new Error(`Authorization server metadata HTTP ${asRes.status}`);
  const as = (await asRes.json()) as { authorization_endpoint?: string; token_endpoint?: string; issuer?: string };
  if (!as.authorization_endpoint) throw new Error('authorization_endpoint is missing');
  if (!as.token_endpoint) throw new Error('token_endpoint is missing');
  return {
    mcpStatus: mcp.status,
    wwwAuthenticate,
    resourceMetadataUrl,
    issuer,
    authorizationEndpoint: as.authorization_endpoint,
    tokenEndpoint: as.token_endpoint,
  };
}

export function findPublicClient(clientId: string): OAuthClientRegistration | undefined {
  return PUBLIC_MCP_CLIENTS.find((c) => c.clientId === clientId);
}

export function protectedResourceMetadata(resource: string, authorizationServers: string[]) {
  const base = resource.replace(/\/$/, '');
  const mcp = /^https?:\/\//i.test(base) ? mcpResourceUrl(base) : undefined;
  const docs = /^https?:\/\//i.test(base) ? `${base}/docs/AGENT_BRIDGE.md` : undefined;
  return {
    resource: mcp ?? base,
    authorization_servers: authorizationServers,
    bearer_methods_supported: ['header'],
    scopes_supported: [...DEFAULT_CONNECTION_SCOPES, 'post', 'commerce_read', 'commerce_propose'],
    resource_documentation: docs,
    mcp_endpoint: mcp,
  };
}

/** RFC 9728 challenge so MCP clients can discover the authorization server. */
export function wwwAuthenticateChallenge(origin: string, extra?: { error?: string; description?: string }): string {
  const base = origin.replace(/\/$/, '');
  const parts = [
    `Bearer resource_metadata="${protectedResourceMetadataPath(base)}"`,
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
    authorization_response_iss_parameter_supported: true,
    resource: mcpResourceUrl(base),
  };
}

export type PublicConnectionDetails = {
  publicUrl: string;
  issuer: string;
  jwksUrl: string;
  mcpUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  revocationUrl: string;
  protectedResourceMetadataUrl: string;
  authorizationServerMetadataUrl: string;
  clients: Array<{ clientId: string; clientName: string }>;
  scopes: Capability[];
  signingReady: boolean;
};

export function publicOrigin(env: OAuthEnv = process.env, requestOrigin = ''): string {
  return oauthIssuer(env) || requestOrigin.replace(/\/$/, '');
}

/** Public, non-secret values a person copies into Codex or Claude. Never includes a PEM. */
export function publicConnectionDetails(
  origin: string,
  signingReady: boolean,
): PublicConnectionDetails {
  const base = origin.replace(/\/$/, '');
  return {
    publicUrl: base,
    issuer: base,
    jwksUrl: `${base}/api/agent-bridge/oauth/jwks`,
    mcpUrl: `${base}/api/agent-bridge/mcp`,
    authorizationUrl: `${base}/api/agent-bridge/oauth/authorize`,
    tokenUrl: `${base}/api/agent-bridge/oauth/token`,
    revocationUrl: `${base}/api/agent-bridge/oauth/revoke`,
    protectedResourceMetadataUrl: `${base}/.well-known/oauth-protected-resource`,
    authorizationServerMetadataUrl: `${base}/.well-known/oauth-authorization-server`,
    clients: PUBLIC_MCP_CLIENTS.map((c) => ({ clientId: c.clientId, clientName: c.clientName })),
    scopes: [...DEFAULT_CONNECTION_SCOPES],
    signingReady,
  };
}

export function codexSetupCommand(mcpUrl: string): string {
  return `codex mcp add bookone --url ${mcpUrl} --oauth-client-id bookone-codex`;
}

export function claudeConnectorSteps(mcpUrl: string): string[] {
  return [
    'Open Claude → Customize → Connectors → Add custom connector → Web.',
    `Name: BookOne AgentBridge. URL: ${mcpUrl}`,
    'Authentication: Sign in when needed. Use your own OAuth client.',
    'Client ID: bookone-claude. Leave the secret empty.',
    'Connect, sign in to BookOne, and Allow Claude. Enable the connector in the conversation.',
  ];
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
  peekCode(code: string): AuthorizationCode | null {
    return this.codes.get(code) ?? null;
  }
  replaceCode(row: AuthorizationCode) {
    this.codes.set(row.code, row);
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
