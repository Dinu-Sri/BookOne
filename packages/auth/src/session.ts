import 'server-only';

import { headers } from 'next/headers';
import { DEFAULT_CHART_OF_ACCOUNTS } from '@bookone/accounting';
import {
  accounts,
  db,
  eq,
  isNull,
  tenantMemberships,
  tenants,
  users,
  withTenantContext,
} from '@bookone/db';
import { auth } from './auth';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  role: string;
}

export interface Session {
  user: SessionUser;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function uniqueTenantSlug(base: string): Promise<string> {
  const safeBase = slugify(base) || 'company';
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? safeBase : `${safeBase}-${i + 1}`;
    const [existing] = await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate)).limit(1);
    if (!existing) return candidate;
  }
  return `${safeBase}-${Date.now()}`;
}

async function ensureBookOneUser(email: string, name: string): Promise<SessionUser> {
  const normalizedEmail = email.toLowerCase().trim();
  const displayName = name.trim() || normalizedEmail.split('@')[0] || 'BookOne user';

  const [existing] = await db()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      tenantId: users.tenantId,
      role: users.role,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    return existing;
  }

  const tenantName = `${displayName}'s Company`;
  const slug = await uniqueTenantSlug(tenantName);

  return db().transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: tenantName, slug, plan: 'starter' })
      .returning({ id: tenants.id });

    if (!tenant) throw new Error('Could not create tenant.');

    const [createdUser] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: normalizedEmail,
        name: displayName,
        passwordHash: 'better-auth-managed',
        role: 'admin',
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        tenantId: users.tenantId,
        role: users.role,
      });

    if (!createdUser) throw new Error('Could not create user.');

    await tx.insert(tenantMemberships).values({
      tenantId: tenant.id,
      userId: createdUser.id,
      role: 'owner',
      status: 'active',
    });

    await tx.insert(accounts).values(
      DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
        tenantId: tenant.id,
        code: account.code,
        name: account.name,
        type: account.type,
        normalSide: account.normalSide,
      })),
    );

    return createdUser;
  });
}

export async function getSession(): Promise<Session | null> {
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession?.user?.email) return null;

  const user = await ensureBookOneUser(authSession.user.email, authSession.user.name ?? '');
  return { user };
}

export async function requireTenantContext(): Promise<SessionUser> {
  const session = await getSession();
  if (!session?.user?.tenantId) {
    throw new Error('No authenticated session with tenant context.');
  }
  return session.user;
}

export async function withTenantAuth<T>(fn: () => Promise<T>): Promise<T> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, fn);
}
