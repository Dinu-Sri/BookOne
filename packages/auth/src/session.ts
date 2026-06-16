import { auth } from './auth';
import { withTenantContext } from '@bookone/db';

export async function getSession() {
  return auth();
}

export async function requireTenantContext() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    throw new Error('No authenticated session with tenant context.');
  }
  return session.user;
}

export async function withTenantAuth<T>(fn: () => Promise<T>): Promise<T> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, fn);
}

export type { Session } from 'next-auth';
