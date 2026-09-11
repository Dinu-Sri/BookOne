import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SCREEN_DEFS,
  getRequestAccess,
  getSession,
  requireTenantContext,
  screenKeyFromHref,
  type AccessLevel,
  type LoadedAccess,
} from '@bookone/auth';

export const getMyAccess = cache(async function getMyAccess(): Promise<LoadedAccess | null> {
  const user = await requireTenantContext();
  return getRequestAccess(user.id, user.tenantId, user.platformRole);
});

export async function assertPermission(
  key: string,
  need: 'read' | 'write' = 'write',
  opts?: { surface?: 'action' | 'rsc' },
): Promise<void> {
  const access = await getMyAccess();
  if (access?.allows(key, need)) return;
  if (opts?.surface === 'rsc' && need === 'read') {
    redirect('/?denied=1');
  }
  throw new Error('You do not have permission to do that.');
}

export async function assertScreenAccess(href: string, need: 'read' | 'write' = 'read'): Promise<void> {
  const prefix = screenKeyFromHref(href);
  if (!prefix) return;
  await assertPermission(need === 'write' ? `${prefix}.write` : `${prefix}.read`, need, { surface: 'rsc' });
}

export function levelForPrefix(access: LoadedAccess | null, prefix: string): AccessLevel {
  if (!access) return 'none';
  if (access.allows(`${prefix}.write`, 'write')) return 'write';
  if (access.allows(`${prefix}.read`, 'read')) return 'read';
  return 'none';
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/login' || pathname === '/reset-password') return true;
  if (pathname === '/invite' || pathname.startsWith('/invite/')) return true;
  if (pathname === '/docs' || pathname.startsWith('/docs/')) return true;
  if (pathname === '/e2e' || pathname.startsWith('/e2e/')) return true;
  if (pathname === '/onboarding' || pathname.startsWith('/onboarding')) return true;
  if (pathname.startsWith('/api/')) return true;
  return false;
}

/** First screen this job can actually open (POS cashiers skip Simple Entry). */
export function landingHrefForAccess(access: LoadedAccess | null): string {
  if (!access) return '/';
  if (access.allows('pos.terminal.read', 'read') && !access.allows('accounting.simple_entry.read', 'read')) {
    return '/pos';
  }
  if (access.allows('accounting.simple_entry.read', 'read')) return '/';
  if (access.allows('accounting.cashbook.read', 'read')) return '/cashbook';
  const hit = SCREEN_DEFS.find((s) => access.allows(`${s.keyPrefix}.read`, 'read'));
  return hit?.href ?? '/';
}

/**
 * Block typed URLs the job cannot read. Safe in `app/template.tsx` (not inside
 * page try/catch that would swallow NEXT_REDIRECT into /login).
 */
export async function assertScreenAccessFromHeaders(): Promise<void> {
  const h = await headers();
  const raw = h.get('x-bookone-pathname') || '';
  const pathname = raw.split('?')[0] || '';
  if (!pathname || isPublicPath(pathname)) return;

  const session = await getSession().catch(() => null);
  if (!session?.user) return;
  if (session.user.platformRole === 'super_admin') return;

  const access = await getRequestAccess(session.user.id, session.user.tenantId, session.user.platformRole);
  if (!access) return;

  if (pathname.startsWith('/control-room')) {
    redirect(`${landingHrefForAccess(access)}?denied=1`);
  }

  const prefix = screenKeyFromHref(pathname);
  if (!prefix) return;
  if (access.allows(`${prefix}.read`, 'read')) return;

  const dest = landingHrefForAccess(access);
  if (dest === pathname || (pathname === '/' && dest === '/')) return;
  const denied = pathname !== '/' && pathname !== dest;
  redirect(denied ? `${dest}?denied=1` : dest);
}
