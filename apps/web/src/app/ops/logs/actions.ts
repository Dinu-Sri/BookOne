'use server';

import { cookies } from 'next/headers';
import { OPS_LOG_COOKIE, opsCookieValue, opsLogSecret, opsPasswordOk } from '@/lib/ops-auth';

export async function unlockOpsLogs(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = opsLogSecret();
  if (!secret) return { ok: false, error: 'OPS_LOG_SECRET is not set.' };
  const password = String(formData.get('password') ?? '');
  if (!opsPasswordOk(password, secret)) return { ok: false, error: 'Wrong password.' };
  const jar = await cookies();
  jar.set(OPS_LOG_COOKIE, opsCookieValue(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/ops/logs',
    maxAge: 60 * 60 * 24 * 7,
  });
  return { ok: true };
}
