import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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
    if ((CAPABILITIES as readonly string[]).includes(k)) out.add(k as Capability);
    if (k === 'purchase.inbox.read' || k === 'agent_bridge.read') out.add('read');
    if (k === 'purchase.inbox.write' || k === 'agent_bridge.upload') {
      out.add('read');
      out.add('upload');
      out.add('draft');
    }
    if (k === 'agent_bridge.approve' || k === 'agent_bridge.approve.write') out.add('approve');
    if (k === 'agent_bridge.post' || k === 'agent_bridge.post.write' || k === 'purchase.bills.write') out.add('post');
    if (k === 'agent_bridge.commerce_read' || k === 'commerce_read') out.add('commerce_read');
    if (k === 'agent_bridge.commerce_propose' || k === 'commerce_propose') {
      out.add('commerce_read');
      out.add('commerce_propose');
    }
  }
  return [...out];
}

/** Effective scopes are token scopes INTERSECT current grants. Never expand a token. */
export function intersectCapabilities(token: Capability[], live: Capability[]): Capability[] {
  const liveSet = new Set(live);
  return token.filter((scope) => liveSet.has(scope));
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

export function hmacFixturesAllowed(env: NodeJS.ProcessEnv | OAuthEnv = process.env): boolean {
  if (env.AGENT_BRIDGE_ALLOW_HMAC === '1') return true;
  if (env.NODE_ENV === 'production') return false;
  return true;
}

export async function resolveActorFromAuthorization(
  header: string | null | undefined,
  secret: string,
  env: OAuthEnv = {},
  now = Date.now(),
  fetchImpl: typeof fetch = fetch,
): Promise<Actor> {
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw Object.assign(new Error('Missing Bearer token.'), { code: 'PERMISSION_DENIED' });
  }
  const token = header.slice(7).trim();
  if (isLocalFixtureToken(token)) {
    if (!hmacFixturesAllowed(env)) {
      throw tokenError(
        'Local HMAC fixtures are disabled in production. Register OAuth or set AGENT_BRIDGE_ALLOW_HMAC=1 for a labelled fixture.',
        'HMAC_DISABLED',
      );
    }
    return actorFromToken(verifyConnectionToken(token, secret, now));
  }
  return actorFromToken(await verifyOAuthAccessToken(token, env, now, fetchImpl));
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
  AGENT_BRIDGE_OAUTH_SIGNING_PEM?: string;
  AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE?: string;
  AGENT_BRIDGE_OAUTH_KID?: string;
  AGENT_BRIDGE_ALLOW_HMAC?: string;
  AGENT_BRIDGE_PUBLIC_URL?: string;
  AUTH_URL?: string;
  BETTER_AUTH_URL?: string;
  NODE_ENV?: string;
  [key: string]: string | undefined;
};

export const DEFAULT_OAUTH_SIGNING_PEM_FILE = '/var/lib/bookone/secrets/agent_bridge_oauth_signing.pem';

export const OAUTH_SETUP_CHECKLIST =
  'OAuth signing could not be loaded or created. Set AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE to a writable absolute PKCS8 path (BookOne generates a key there once and reuses it) or AGENT_BRIDGE_OAUTH_SIGNING_PEM to a PEM body, and AGENT_BRIDGE_OAUTH_ISSUER (or AGENT_BRIDGE_PUBLIC_URL / AUTH_URL) to this host origin. JWKS is derived at /api/agent-bridge/oauth/jwks and /.well-known/jwks.json. Pre-register only bookone-codex and bookone-claude. Do not set AGENT_BRIDGE_ALLOW_HMAC=1 on staging as a substitute for RS256.';

const PRIVATE_KEY_PEM = /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----/;

export function oauthIssuer(env: OAuthEnv = process.env): string {
  const raw =
    env.AGENT_BRIDGE_OAUTH_ISSUER?.trim() ||
    env.AGENT_BRIDGE_PUBLIC_URL?.trim() ||
    env.AUTH_URL?.trim() ||
    env.BETTER_AUTH_URL?.trim() ||
    '';
  return raw.replace(/\/$/, '');
}

export function readSigningPemFile(filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new Error('AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE must be an absolute path.');
  }
  return readFileSync(filePath, 'utf8');
}

function privateKeyPemBody(raw: string | undefined): string | undefined {
  const pem = raw?.trim();
  if (!pem || !PRIVATE_KEY_PEM.test(pem)) return undefined;
  return pem;
}

/** FILE wins when set. Missing/unreadable file does not fall back to the env PEM body. */
export function oauthSigningPem(
  env: OAuthEnv = process.env,
  readFile: (filePath: string) => string = readSigningPemFile,
): string | undefined {
  const filePath = env.AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE?.trim();
  if (filePath) {
    try {
      return privateKeyPemBody(readFile(filePath));
    } catch {
      return undefined;
    }
  }
  return privateKeyPemBody(env.AGENT_BRIDGE_OAUTH_SIGNING_PEM);
}

export function generatePkcs8RsaPem(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

function persistFilePath(filePath: string): string {
  try {
    if (statSync(filePath).isDirectory()) {
      return path.join(filePath, 'agent_bridge_oauth_signing.pem');
    }
  } catch {
    // Missing path is created as a file.
  }
  return filePath;
}

function tryReadPem(filePath: string, readFile: (filePath: string) => string): string | undefined {
  try {
    return privateKeyPemBody(readFile(filePath));
  } catch {
    return undefined;
  }
}

function writeExclusivePem(filePath: string, pem: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, pem, { encoding: 'utf8', flag: 'wx' });
  try {
    chmodSync(filePath, 0o400);
  } catch {
    // Windows may refuse unix file modes. The exclusive create already happened.
  }
}

function persistGeneratedPem(filePath: string, readFile: (filePath: string) => string): string | undefined {
  const pem = generatePkcs8RsaPem();
  try {
    writeExclusivePem(filePath, pem);
    return privateKeyPemBody(pem);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return tryReadPem(filePath, readFile);
    return undefined;
  }
}

/**
 * Load the signing PEM, generating a PKCS8 RSA key once into a durable file when missing.
 * FILE wins. A missing FILE path does not fall back to the env PEM body.
 * Never logs the key body.
 */
export function ensureOauthSigningPem(
  env: OAuthEnv = process.env,
  readFile: (filePath: string) => string = readSigningPemFile,
): string | undefined {
  const filePath = env.AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE?.trim();
  if (filePath) {
    if (!path.isAbsolute(filePath)) return undefined;
    const existing = tryReadPem(filePath, readFile);
    if (existing) return existing;
    const target = persistFilePath(filePath);
    if (target !== filePath) {
      const nested = tryReadPem(target, readFile);
      if (nested) return nested;
    }
    return persistGeneratedPem(target, readFile);
  }
  const envPem = privateKeyPemBody(env.AGENT_BRIDGE_OAUTH_SIGNING_PEM);
  if (envPem) return envPem;
  if (env.NODE_ENV === 'production') {
    return persistGeneratedPem(DEFAULT_OAUTH_SIGNING_PEM_FILE, readFile);
  }
  return undefined;
}

export function oauthKid(env: OAuthEnv = process.env): string {
  return env.AGENT_BRIDGE_OAUTH_KID?.trim() || 'bookone-agent-bridge';
}

export function jwksFromSigningPem(pem: string, kid: string): { keys: Array<Record<string, string>> } {
  const pub = createPublicKey(pem);
  const jwk = pub.export({ format: 'jwk' }) as { n?: string; e?: string; kty?: string };
  if (!jwk.n || !jwk.e) throw tokenError('OAuth signing key is not an RSA key.', 'PROVIDER_UNCONFIGURED');
  return { keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid, n: jwk.n, e: jwk.e }] };
}

export function mintRs256AccessToken(args: {
  privateKeyPem: string;
  kid: string;
  issuer: string;
  tenantId: string;
  userId: string;
  clientId: string;
  connectionId: string;
  scopes: Capability[];
  hours?: number;
  now?: number;
}): string {
  const nowMs = args.now ?? Date.now();
  const hours = args.hours ?? 8;
  const ttlMs = Math.min(hours * 3600_000, MAX_TOKEN_TTL_MS);
  const header = { alg: 'RS256', kid: args.kid, typ: 'JWT' };
  const payload = {
    iss: args.issuer,
    aud: TOKEN_AUDIENCE,
    sub: args.userId,
    tenant_id: args.tenantId,
    client_id: args.clientId,
    connection_id: args.connectionId,
    scope: args.scopes.join(' '),
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor((nowMs + ttlMs) / 1000),
  };
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${h}.${p}`);
  signer.end();
  const key = createPrivateKey(args.privateKeyPem);
  return `${h}.${p}.${signer.sign(key).toString('base64url')}`;
}

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
  const issuer = oauthIssuer(env);
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
  const jwksUrl =
    env.AGENT_BRIDGE_OAUTH_JWKS_URL || `${issuer.replace(/\/$/, '')}/api/agent-bridge/oauth/jwks`;
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

function encodeLength(len: number): Buffer {
  if (len < 128) return Buffer.from([len]);
  if (len < 256) return Buffer.from([0x81, len]);
  if (len < 65536) return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
  throw tokenError('OAuth public key is too large.');
}

function encodeInteger(value: Buffer): Buffer {
  const body = value[0]! & 0x80 ? Buffer.concat([Buffer.from([0]), value]) : value;
  return Buffer.concat([Buffer.from([0x02]), encodeLength(body.length), body]);
}

function encodeBitString(value: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from([0x00]), value]);
  return Buffer.concat([Buffer.from([0x03]), encodeLength(body.length), body]);
}

function encodeSequence(value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0x30]), encodeLength(value.length), value]);
}
