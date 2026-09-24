import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE = 'bookone_ops_log';

export function opsLogSecret(): string {
  return String(process.env.OPS_LOG_SECRET ?? '').trim();
}

export function opsCookieValue(secret: string) {
  return createHmac('sha256', secret).update('bookone-ops-log').digest('hex');
}

export function opsPasswordOk(given: string, secret: string) {
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function opsCookieOk(cookie: string | undefined, secret: string) {
  if (!secret || !cookie) return false;
  const expect = opsCookieValue(secret);
  const a = Buffer.from(cookie);
  const b = Buffer.from(expect);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export { COOKIE as OPS_LOG_COOKIE };
