import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { COMMERCE_SCOPES, type CommerceEnvironment, type CommerceScope } from './types';

export const TOKEN_PREFIX = 'bkc';

export function hashSecret(secret: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${secret}`).digest('hex');
}

export function parseToken(token: string): { env: CommerceEnvironment; prefix: string; secret: string } | null {
  const parts = token.trim().split('_');
  if (parts.length !== 4) return null;
  const [kind, env, prefix, secret] = parts;
  if (kind !== TOKEN_PREFIX) return null;
  if (env !== 'live' && env !== 'sand') return null;
  if (!prefix || prefix.length < 8 || !secret || secret.length < 32) return null;
  return { env: env === 'live' ? 'live' : 'sandbox', prefix, secret };
}

export function issueToken(environment: CommerceEnvironment): {
  token: string;
  prefix: string;
  secret: string;
} {
  const prefix = randomBytes(6).toString('hex').slice(0, 12);
  const secret = randomBytes(24).toString('hex');
  const env = environment === 'live' ? 'live' : 'sand';
  return {
    token: `${TOKEN_PREFIX}_${env}_${prefix}_${secret}`,
    prefix,
    secret,
  };
}

export function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * WP7: fine-grained scope names. Each maps onto one stored v1 scope, so old
 * keys keep working and new names can be sent when issuing a key.
 */
export const SCOPE_ALIASES: Record<string, CommerceScope> = {
  'catalog:read': 'catalog',
  'pricing:read': 'catalog',
  'webhooks:manage': 'catalog',
  'inventory:read': 'inventory',
  'reservations:write': 'inventory',
  'orders:write': 'order',
  'orders:read': 'order',
  'customers:read': 'order',
  'customers:write': 'order',
  lifecycle: 'lifecycle',
};

/** The fine-grained names a set of v1 scopes grants. */
export function grantedScopeNames(scopes: CommerceScope[]): string[] {
  return Object.entries(SCOPE_ALIASES)
    .filter(([, v]) => scopes.includes(v))
    .map(([k]) => k);
}

export function parseScopes(raw: string | string[] | undefined): CommerceScope[] {
  const parts = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,\s]+/);
  const out: CommerceScope[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    const key = (SCOPE_ALIASES[trimmed] ?? trimmed) as CommerceScope;
    if ((COMMERCE_SCOPES as readonly string[]).includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

export function defaultScopes(): CommerceScope[] {
  return [...COMMERCE_SCOPES];
}

export function redactedCredential(row: {
  id: string;
  prefix: string;
  scopes: CommerceScope[];
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}) {
  return {
    id: row.id,
    prefix: row.prefix,
    scopes: row.scopes,
    status: row.status,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    secret: null as string | null,
  };
}

const hits = new Map<string, { count: number; resetAt: number }>();

/** Per-key fixed window. Documented limit: 600 requests per minute per key (G8). */
export const RATE_LIMIT_PER_MINUTE = 600;

export function rateLimit(
  key: string,
  limit = RATE_LIMIT_PER_MINUTE,
  windowMs = 60_000,
): { ok: boolean; retryAfter: number; remaining: number; limit: number } {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0, remaining: limit - 1, limit };
  }
  cur.count += 1;
  if (cur.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)), remaining: 0, limit };
  }
  return { ok: true, retryAfter: 0, remaining: Math.max(0, limit - cur.count), limit };
}

export function resetRateLimitForTests() {
  hits.clear();
}
