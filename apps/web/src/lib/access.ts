import { cache } from 'react';
import { redirect } from 'next/navigation';
import {
  getRequestAccess,
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
