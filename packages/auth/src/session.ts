import 'server-only';

import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { chartOfAccountsForEntity } from '@bookone/accounting';
import {
  accounts,
  and,
  db,
  eq,
  isNull,
  sql,
  tenantMemberships,
  tenantRoles,
  tenants,
  users,
  withTenantContext,
} from '@bookone/db';
import { auth } from './auth';
import { ensureOwnerMembership, seedJobsForTenant } from './permissions/seed-jobs';

export const INVITE_COOKIE = 'bookone_invite_token';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  homeTenantId: string;
  role: string;
  platformRole: 'super_admin' | 'user';
  jobSlug: string | null;
  jobId: string | null;
}

export interface Session {
  user: SessionUser;
}

export type AuthIdentity = { email: string; name: string };

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

export async function getAuthIdentity(): Promise<AuthIdentity | null> {
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession?.user?.email) return null;
  return {
    email: authSession.user.email.toLowerCase().trim(),
    name: authSession.user.name ?? '',
  };
}

async function hasInviteCookie(): Promise<boolean> {
  try {
    const jar = await cookies();
    return Boolean(jar.get(INVITE_COOKIE)?.value);
  } catch {
    return false;
  }
}

async function toSessionUser(row: {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  activeTenantId?: string | null;
  role: string;
}): Promise<SessionUser> {
  const homeTenantId = row.tenantId;
  const tenantId = row.activeTenantId || row.tenantId;
  const platformRole: 'super_admin' | 'user' = row.role === 'super_admin' ? 'super_admin' : 'user';

  const [membership] = await db()
    .select({
      id: tenantMemberships.id,
      role: tenantMemberships.role,
      status: tenantMemberships.status,
      primaryRoleId: tenantMemberships.primaryRoleId,
    })
    .from(tenantMemberships)
    .where(
      andMem(tenantId, row.id),
    )
    .limit(1);

  let jobSlug = membership?.role ?? null;
  let jobId = membership?.primaryRoleId ?? null;
  if (membership?.primaryRoleId) {
    const [role] = await db()
      .select({ slug: tenantRoles.slug, id: tenantRoles.id })
      .from(tenantRoles)
      .where(eq(tenantRoles.id, membership.primaryRoleId))
      .limit(1);
    if (role) {
      jobSlug = role.slug;
      jobId = role.id;
    }
  }

  const sessionRole = jobSlug || (platformRole === 'super_admin' ? 'owner' : row.role);

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    tenantId,
    homeTenantId,
    role: sessionRole,
    platformRole,
    jobSlug,
    jobId,
  };
}

function andMem(tenantId: string, userId: string) {
  return sql`${tenantMemberships.tenantId} = ${tenantId}::uuid
    and ${tenantMemberships.userId} = ${userId}::uuid
    and ${tenantMemberships.voidedAt} is null
    and ${tenantMemberships.status} = 'active'`;
}

async function ensureBookOneUser(email: string, name: string): Promise<SessionUser | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const displayName = name.trim() || normalizedEmail.split('@')[0] || 'BookOne user';

  const [existing] = await db()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      tenantId: users.tenantId,
      activeTenantId: users.activeTenantId,
      role: users.role,
      voidedAt: users.voidedAt,
    })
    .from(users)
    .where(andEqEmail(normalizedEmail))
    .limit(1);

  if (existing) {
    if (existing.voidedAt) return null;
    return toSessionUser(existing);
  }

  if (await hasInviteCookie()) {
    return null;
  }

  const tenantName = `${displayName}'s workspace`;
  const slug = await uniqueTenantSlug(tenantName);
  const coa = chartOfAccountsForEntity('personal');

  const created = await db().transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: tenantName,
        slug,
        plan: 'starter',
        entityKind: 'pending',
        rbacEnforced: true,
        modules: {
          sales: false,
          purchase: false,
          inventory: false,
          pos: false,
          hr: false,
        },
      })
      .returning({ id: tenants.id });

    if (!tenant) throw new Error('Could not create tenant.');

    const [createdUser] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        activeTenantId: tenant.id,
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
        activeTenantId: users.activeTenantId,
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
      coa.map((account) => ({
        tenantId: tenant.id,
        code: account.code,
        name: account.name,
        type: account.type,
        normalSide: account.normalSide,
      })),
    );

    return createdUser;
  });

  await seedJobsForTenant(created.tenantId);
  const [owner] = await db()
    .select({ id: tenantRoles.id })
    .from(tenantRoles)
    .where(and(eq(tenantRoles.tenantId, created.tenantId), eq(tenantRoles.slug, 'owner'), isNull(tenantRoles.voidedAt)))
    .limit(1);
  if (owner) {
    await db()
      .update(tenantMemberships)
      .set({ primaryRoleId: owner.id, role: 'owner' })
      .where(and(eq(tenantMemberships.userId, created.id), eq(tenantMemberships.tenantId, created.tenantId)));
  }

  return toSessionUser(created);
}

function andEqEmail(email: string) {
  return sql`lower(${users.email}) = ${email} and ${users.voidedAt} is null`;
}

export const getSession = cache(async function getSession(): Promise<Session | null> {
  const identity = await getAuthIdentity();
  if (!identity) return null;
  const user = await ensureBookOneUser(identity.email, identity.name);
  if (!user) return null;
  return { user };
});

export async function requireTenantContext(): Promise<SessionUser> {
  const session = await getSession();
  if (!session?.user?.tenantId) {
    throw new Error('No authenticated session with tenant context.');
  }
  const user = session.user;
  const [membership] = await db()
    .select({ id: tenantMemberships.id, status: tenantMemberships.status })
    .from(tenantMemberships)
    .where(andMem(user.tenantId, user.id))
    .limit(1);
  if (!membership || membership.status !== 'active') {
    if (user.platformRole === 'super_admin') return user;
    throw new Error('No active membership in this workspace.');
  }
  const [tenant] = await db()
    .select({ status: tenants.status, voidedAt: tenants.voidedAt })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);
  if (!tenant || tenant.voidedAt) throw new Error('Workspace is not available.');
  if (tenant.status === 'suspended') throw new Error('Workspace is suspended.');
  return user;
}

export async function withTenantAuth<T>(fn: () => Promise<T>): Promise<T> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, fn);
}

export { ensureOwnerMembership, seedJobsForTenant };
