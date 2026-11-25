/**
 * Pure helpers for choosing the public origin of absolute links (invite
 * links, print/QR links, redirects). Kept free of Next.js imports so it can be
 * unit tested (packages/auth/test/public-origin.test.ts).
 *
 * The same app can be served on several hosts (staging: bookone.clossyan.com
 * and staging.clossyan.com). Links must use the host the user is on, or the
 * session cookie (per host) does not apply. The request Host header is only
 * trusted when it matches a configured origin; otherwise anyone could forge
 * links to their own domain via a spoofed Host header.
 */

type Env = Record<string, string | undefined>;

function toOrigin(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

/** Configured public origins, primary first (AUTH_URL family, then trusted extras). */
export function configuredOrigins(env: Env): string[] {
  const candidates = [
    env.AUTH_URL,
    env.BETTER_AUTH_URL,
    env.APP_URL,
    ...(env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(','),
  ];
  const out: string[] = [];
  for (const c of candidates) {
    const origin = toOrigin(c);
    if (origin && !out.includes(origin)) out.push(origin);
  }
  return out;
}

/**
 * Pick the configured origin whose host matches the request host. Scheme
 * comes from configuration (TLS ends at Cloudflare, so the forwarded proto
 * inside the stack is often http). Falls back to the primary origin.
 */
export function pickPublicOrigin(requestHost: string | null | undefined, env: Env): string {
  const origins = configuredOrigins(env);
  const host = (requestHost ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  if (host) {
    const match = origins.find((origin) => new URL(origin).host === host);
    if (match) return match;
  }
  return origins[0] ?? '';
}
