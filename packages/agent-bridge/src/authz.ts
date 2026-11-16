import { createHmac, createVerify, randomBytes, timingSafeEqual } from 'node:crypto';
import { CAPABILITIES, type Actor, type Capability } from './contracts';

export const TOKEN_AUDIENCE = 'bookone.agent-bridge';
export const TOKEN_ISSUER = 'bookone.agent-bridge.local';
export const LOCAL_TOKEN_KIND = 'ab1';
export const MAX_TOKEN_TTL_MS = 24 * 3600_000;
export const ALLOWED_SCOPES: readonly Capability[] = CAPABILITIES;

export type ConnectionToken = {
  iss: string;
  aud: string;
  tenantId: string;
  userId: string;
  clientId: string;
  connectionId: string;
  scopes: Capability[];
  iat: number;
  exp: number;
};

export function parseScopes(keys: string[]): Capability[] {
  const out = new Set<Capability>();
  for (const k of keys) {
    if (k === 'purchase.inbox.read' || k === 'agent_bridge.read') out.add('read');
    if (k === 'purchase.inbox.write' || k === 'agent_bridge.upload') {
      out.add('read');
      out.add('upload');
      out.add('draft');
    }
    if (k === 'agent_bridge.approve') out.add('approve');
    if (k === 'agent_bridge.post' || k === 'purchase.bills.write') out.add('post');
  }
  return [...out];
}

export function assertCapability(actor: Actor, need: Capability): void {
  if (!actor.capabilities.includes(need)) {
    const err = new Error(`Missing capability ${need}.`);
    (err as Error & { code: string }).code = 'PERMISSION_DENIED';
    throw err;
  }
}

export function tokenError(message: string, code = 'TOKEN_INVALID'): Error {
  return Object.assign(new Error(message), { code });
}

export function isLocalFixtureToken(token: string): boolean {
  return token.startsWith(`${LOCAL_TOKEN_KIND}.`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (ALLOWED_SCOPES as readonly string[]).includes(value);
}

export function assertTokenSchema(payload: Partial<ConnectionToken>, now = Date.now()): ConnectionToken {
  if (!isNonEmptyString(payload.iss)) throw tokenError('AgentBridge token issuer is required.');
  if (!isNonEmptyString(payload.aud) || payload.aud !== TOKEN_AUDIENCE) {
    throw tokenError('AgentBridge token audience is invalid.');
  }
  if (!isNonEmptyString(payload.tenantId)) throw tokenError('AgentBridge token tenant is required.');
  if (!isNonEmptyString(payload.userId)) throw tokenError('AgentBridge token user is required.');
  if (!isNonEmptyString(payload.clientId)) throw tokenError('AgentBridge token client is required.');
  if (!isNonEmptyString(payload.connectionId)) throw tokenError('AgentBridge token connection is required.');
  if (!Array.isArray(payload.scopes) || payload.scopes.some((s) => !isCapability(s))) {
    throw tokenError('AgentBridge token scopes are invalid.');
  }
  if (!Number.isFinite(payload.iat) || (payload.iat as number) <= 0) {
    throw tokenError('AgentBridge token issued-at is required.');
  }
  if (!Number.isFinite(payload.exp) || (payload.exp as number) <= 0) {
    throw tokenError('AgentBridge token expiry is required.');
  }
  const iat = payload.iat as number;
  const exp = payload.exp as number;
  if (exp <= now) throw tokenError('AgentBridge token expired.');
  if (exp <= iat) throw tokenError('AgentBridge token expiry is not after issued-at.');
  if (exp - iat > MAX_TOKEN_TTL_MS + 1000) throw tokenError('AgentBridge token lifetime exceeds 24 hours.');
  if (exp - now > MAX_TOKEN_TTL_MS) throw tokenError('AgentBridge token remaining lifetime is unbounded.');
  return {
    iss: payload.iss,
    aud: payload.aud,
    tenantId: payload.tenantId,
    userId: payload.userId,
    clientId: payload.clientId,
    connectionId: payload.connectionId,
    scopes: payload.scopes,
    iat,
    exp,
  };
}

export function signConnectionToken(payload: ConnectionToken, secret: string): string {
  if (!secret) throw tokenError('AgentBridge signing secret is required.');
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${LOCAL_TOKEN_KIND}.${body}.${sig}`;
}

export function verifyConnectionToken(token: string, secret: string, now = Date.now()): ConnectionToken {
  if (!secret) throw tokenError('AgentBridge verifying secret is required.');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== LOCAL_TOKEN_KIND) {
    throw tokenError('Unknown or malformed AgentBridge token.');
  }
  const [, body, sig] = parts;
  const expected = createHmac('sha256', secret).update(body!).digest('base64url');
  const a = Buffer.from(sig ?? '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw tokenError('Invalid AgentBridge token signature.');
  const payload = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8')) as Partial<ConnectionToken>;
  const checked = assertTokenSchema(payload, now);
  if (checked.iss !== TOKEN_ISSUER) throw tokenError('AgentBridge token issuer is invalid.');
  return checked;
}

export function actorFromToken(payload: ConnectionToken): Actor {
  return {
    userId: payload.userId,
    tenantId: payload.tenantId,
    capabilities: payload.scopes,
    connectionId: payload.connectionId,
    clientId: payload.clientId,
  };
}

export function mintLocalFixtureToken(args: {
  tenantId: string;
  userId: string;
  scopes: Capability[];
  secret: string;
  hours?: number;
}): string {
  const now = Date.now();
  const hours = args.hours ?? 8;
  const ttl = Math.min(hours * 3600_000, MAX_TOKEN_TTL_MS);
  return signConnectionToken(
    {
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
      tenantId: args.tenantId,
      userId: args.userId,
      clientId: 'local-fixture',
      connectionId: randomBytes(8).toString('hex'),
      scopes: args.scopes,
      iat: now,
      exp: now + ttl,
    },
    args.secret,
  );
}

export type OAuthEnv = {
  AGENT_BRIDGE_OAUTH_ISSUER?: string;
  AGENT_BRIDGE_OAUTH_AUDIENCE?: string;
  AGENT_BRIDGE_OAUTH_JWKS_URL?: string;
};

/** Production OAuth/OIDC access tokens. Local HMAC `ab1.*` fixtures are rejected here. */
export async function verifyOAuthAccessToken(
  token: string,
  env: OAuthEnv,
  now = Date.now(),
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectionToken> {
  if (isLocalFixtureToken(token)) {
    throw tokenError('Local HMAC fixture is not production OAuth.');
  }
  const issuer = env.AGENT_BRIDGE_OAUTH_ISSUER?.trim();
  if (!issuer) throw tokenError('OAuth issuer is not configured.', 'PROVIDER_UNCONFIGURED');
  const audience = env.AGENT_BRIDGE_OAUTH_AUDIENCE?.trim() || TOKEN_AUDIENCE;
  const parts = token.split('.');
  if (parts.length !== 3) throw tokenError('Malformed OAuth access token.');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64!, 'base64url').toString('utf8')) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256') throw tokenError('OAuth token algorithm is not RS256.');
  const claims = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf8')) as Record<string, unknown>;
  if (claims.iss !== issuer) throw tokenError('OAuth token issuer is invalid.');
  const aud = claims.aud;
  const audOk = aud === audience || (Array.isArray(aud) && aud.includes(audience));
  if (!audOk) throw tokenError('OAuth token audience is invalid.');
  const jwksUrl = env.AGENT_BRIDGE_OAUTH_JWKS_URL || `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
  const jwksRes = await fetchImpl(jwksUrl, { signal: AbortSignal.timeout(5_000) });
  if (!jwksRes.ok) throw tokenError('OAuth JWKS could not be loaded.');
  const jwks = (await jwksRes.json()) as { keys?: Array<{ kid?: string; kty?: string; n?: string; e?: string }> };
  const key = (jwks.keys ?? []).find((k) => k.kty === 'RSA' && (!header.kid || k.kid === header.kid));
  if (!key?.n || !key?.e) throw tokenError('OAuth signing key was not found.');
  const pem = rsaJwkToPem(key.n, key.e);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const ok = verifier.verify(pem, Buffer.from(sigB64!, 'base64url'));
  if (!ok) throw tokenError('OAuth token signature is invalid.');
  const expSec = Number(claims.exp);
  const iatSec = Number(claims.iat ?? claims.nbf ?? 0);
  if (!Number.isFinite(expSec)) throw tokenError('OAuth token expiry is required.');
  return assertTokenSchema(
    {
      iss: issuer,
      aud: audience,
      tenantId: String(claims.tenant_id ?? claims.tid ?? ''),
      userId: String(claims.sub ?? ''),
      clientId: String(claims.client_id ?? claims.azp ?? ''),
      connectionId: String(claims.connection_id ?? claims.azp ?? claims.sub ?? ''),
      scopes: parseScopes(String(claims.scope ?? '').split(/[\s,]+/).filter(Boolean)),
      iat: iatSec > 1e12 ? iatSec : iatSec * 1000,
      exp: expSec > 1e12 ? expSec : expSec * 1000,
    },
    now,
  );
}

function rsaJwkToPem(nB64: string, eB64: string): string {
  const n = Buffer.from(nB64, 'base64url');
  const e = Buffer.from(eB64, 'base64url');
  const der = encodeRsaPublicKey(n, e);
  const b64 = der.toString('base64');
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`;
}

function encodeRsaPublicKey(n: Buffer, e: Buffer): Buffer {
  const nInt = encodeInteger(n);
  const eInt = encodeInteger(e);
  const seq = encodeSequence(Buffer.concat([nInt, eInt]));
  const alg = Buffer.from('300d06092a864886f70d0101010500', 'hex');
  const bitString = encodeBitString(seq);
  return encodeSequence(Buffer.concat([alg, bitString]));
}

function encodeInteger(value: Buffer): Buffer {
  const body = value[0]! & 0x80 ? Buffer.concat([Buffer.from([0]), value]) : value;
  return Buffer.concat([Buffer.from([0x02, body.length]), body]);
}

function encodeBitString(value: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from([0x00]), value]);
  return Buffer.concat([Buffer.from([0x03, body.length]), body]);
}

function encodeSequence(value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x30, value.length]), value]);
}
