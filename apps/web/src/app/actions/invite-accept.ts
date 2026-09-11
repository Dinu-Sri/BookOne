'use server';

import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthIdentity, INVITE_COOKIE, seedJobsForTenant } from '@bookone/auth';
import {
  and,
  auditLog,
  db,
  eq,
  isNull,
  sql,
  tenantInvites,
  tenantMemberships,
  tenantRoles,
  tenants,
  users,
} from '@bookone/db';
import { homePathForEntity, parseEntityKind } from '@/lib/entity-kind';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function peekInvite(token: string): Promise<{ ok: boolean; company?: string; email?: string; error?: string }> {
  const hashed = hashToken(token);
  const [row] = await db()
    .select({
      id: tenantInvites.id,
      tenantId: tenantInvites.tenantId,
      email: tenantInvites.email,
      status: tenantInvites.status,
      expiresAt: tenantInvites.expiresAt,
    })
    .from(tenantInvites)
    .where(and(eq(tenantInvites.tokenHash, hashed), isNull(tenantInvites.voidedAt)))
    .limit(1);
  if (!row) return { ok: false, error: 'This invite is not valid.' };
  if (row.status !== 'pending' || new Date(row.expiresAt) < new Date()) {
    return { ok: false, error: 'This invite is not valid.' };
  }
  const jar = await cookies();
  jar.set(INVITE_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
  const [tenant] = await db().select({ name: tenants.name }).from(tenants).where(eq(tenants.id, row.tenantId)).limit(1);
  return { ok: true, company: tenant?.name, email: row.email };
}

export async function acceptInvite(): Promise<{ ok: boolean; error?: string; homePath?: string }> {
  const identity = await getAuthIdentity();
  if (!identity) return { ok: false, error: 'Sign in to accept this invite.' };
  const jar = await cookies();
  const token = jar.get(INVITE_COOKIE)?.value;
  if (!token) return { ok: false, error: 'This invite is not valid.' };
  const hashed = hashToken(token);
  const [invite] = await db()
    .select()
    .from(tenantInvites)
    .where(and(eq(tenantInvites.tokenHash, hashed), isNull(tenantInvites.voidedAt)))
    .limit(1);
  if (!invite || invite.status !== 'pending' || new Date(invite.expiresAt) < new Date()) {
    return { ok: false, error: 'This invite is not valid.' };
  }
  if (identity.email !== String(invite.email).toLowerCase()) {
    return { ok: false, error: 'This invite is not valid.' };
  }

  const [job] = await db()
    .select({ id: tenantRoles.id, slug: tenantRoles.slug })
    .from(tenantRoles)
    .where(eq(tenantRoles.id, invite.roleId))
    .limit(1);

  const [existing] = await db()
    .select({ id: users.id, voidedAt: users.voidedAt })
    .from(users)
    .where(sql`lower(${users.email}) = ${identity.email} and ${users.voidedAt} is null`)
    .limit(1);

  let userId = existing?.id;
  await db().transaction(async (tx) => {
    if (!userId) {
      const [created] = await tx
        .insert(users)
        .values({
          tenantId: invite.tenantId,
          activeTenantId: invite.tenantId,
          email: identity.email,
          name: identity.name || identity.email.split('@')[0] || 'User',
          passwordHash: 'better-auth-managed',
          role: 'member',
        })
        .returning({ id: users.id });
      userId = created?.id;
    } else {
      await tx
        .update(users)
        .set({ activeTenantId: invite.tenantId, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
    const [mem] = await tx
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, invite.tenantId),
          eq(tenantMemberships.userId, userId!),
          isNull(tenantMemberships.voidedAt),
        ),
      )
      .limit(1);
    if (!mem) {
      await tx.insert(tenantMemberships).values({
        tenantId: invite.tenantId,
        userId: userId!,
        role: job?.slug ?? 'viewer',
        primaryRoleId: job?.id ?? null,
        status: 'active',
      });
    }
    await tx
      .update(tenantInvites)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedUserId: userId!,
        updatedAt: new Date(),
      })
      .where(eq(tenantInvites.id, invite.id));
    await tx.insert(auditLog).values({
      tenantId: invite.tenantId,
      userId: userId!,
      action: 'UPDATE',
      tableName: 'tenant_invites',
      recordId: invite.id,
      notes: 'Accepted invite.',
    });
  });

  jar.set(INVITE_COOKIE, '', { path: '/', maxAge: 0 });
  await seedJobsForTenant(invite.tenantId);
  const [tenant] = await db()
    .select({ entityKind: tenants.entityKind, capabilityTier: tenants.capabilityTier })
    .from(tenants)
    .where(eq(tenants.id, invite.tenantId))
    .limit(1);
  return {
    ok: true,
    homePath: homePathForEntity(parseEntityKind(tenant?.entityKind), tenant?.capabilityTier),
  };
}

export async function stashInviteToken(token: string) {
  const jar = await cookies();
  jar.set(INVITE_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
}
