import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** WP4: kinds a webhook (or `?kinds=`) can select. Empty selection = every kind. */
export const CHANGE_KINDS = [
  'product',
  'variant',
  'price',
  'image',
  'inventory',
  'category',
  'brand',
  'order',
  'customer',
  'reservation',
  'mapping',
  'publish',
  'catalog',
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** Signatures older than this are replays (receivers should reject them). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;
/** Retries continue for 24 hours, then the endpoint is marked failing. */
export const WEBHOOK_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A rotated secret keeps signing (second v1=) for this long. */
export const WEBHOOK_ROTATION_OVERLAP_MS = 24 * 60 * 60 * 1000;

export function parseKinds(raw: unknown): ChangeKind[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  const out: ChangeKind[] = [];
  for (const k of list) {
    const v = String(k).trim().toLowerCase();
    if (!v) continue;
    if (!(CHANGE_KINDS as readonly string[]).includes(v)) throw new Error(`Unknown change kind "${v}". Use ${CHANGE_KINDS.join(', ')}.`);
    if (!out.includes(v as ChangeKind)) out.push(v as ChangeKind);
  }
  return out;
}

/**
 * Does a feed item match a kinds filter? `variant` selects product items that
 * belong to a variant (they carry `variantId`).
 */
export function kindMatches(kinds: readonly string[], item: { kind: string; payload?: Record<string, unknown> | null }): boolean {
  if (!kinds.length) return true;
  if (kinds.includes(item.kind)) return true;
  if (item.kind === 'product' && kinds.includes('variant') && item.payload?.variantId) return true;
  return false;
}

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

/** `X-BookOne-Signature: t=<unix>,v1=<hex>[,v1=<hex during rotation>]`. */
export function signWebhook(secrets: string[], body: string, unixSeconds: number): string {
  const parts = [`t=${unixSeconds}`];
  for (const s of secrets) parts.push(`v1=${createHmac('sha256', s).update(`${unixSeconds}.${body}`).digest('hex')}`);
  return parts.join(',');
}

/** Receiver-side check (also used in tests and docs). */
export function verifyWebhook(secret: string, header: string, body: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const fields = header.split(',').map((p) => p.trim().split('='));
  const t = Number(fields.find(([k]) => k === 't')?.[1]);
  if (!Number.isFinite(t) || Math.abs(nowSeconds - t) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  return fields
    .filter(([k]) => k === 'v1')
    .some(([, v]) => {
      const got = Buffer.from(v ?? '');
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
}

/** Exponential backoff: 30 s, 1 min, 2 min … capped at 6 h. */
export function retryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60 * 1000);
}

function keyFrom(appSecret: string): Buffer {
  return createHash('sha256').update(`bookone-commerce-webhook:${appSecret}`).digest();
}

export function encryptSecret(secret: string, appSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(appSecret), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')}`;
}

export function decryptSecret(enc: string, appSecret: string): string {
  if (!enc.startsWith('v1:')) throw new Error('Unknown secret format.');
  const raw = Buffer.from(enc.slice(3), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(appSecret), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd])/i;

/**
 * HTTPS only. Sandbox connections may also use http://localhost or 127.0.0.1
 * for local testing. Private network addresses are refused on live connections.
 */
export function validateWebhookUrl(raw: string, environment: 'sandbox' | 'live'): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Enter a full URL, e.g. https://shop.example/api/bookone/webhook.');
  }
  const local = PRIVATE_HOST.test(url.hostname);
  if (url.protocol === 'http:' && !(environment === 'sandbox' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname))) {
    throw new Error('Webhook URLs must use https.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Webhook URLs must use https.');
  if (local && environment === 'live') throw new Error('Webhook URLs cannot point to a private network address.');
  if (url.username || url.password) throw new Error('Do not put credentials in the webhook URL.');
  return url.toString().slice(0, 500);
}
