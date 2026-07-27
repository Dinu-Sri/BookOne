'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  db,
  eq,
  isNull,
  tenantMemberships,
  tenants,
  users,
} from '@bookone/db';
import {
  canAccessFullErp,
  homePathForEntity,
  parseEntityKind,
  type EntityKind,
} from '@/lib/entity-kind';

export type WorkspaceOption = {
  tenantId: string;
  name: string;
  slug: string;
  entityKind: EntityKind;
  capabilityTier: string | null;
  status: string;
  role: string;
  isCurrent: boolean;
  /** Where to land after switching */
  homePath: string;
};

/**
 * Workspaces the signed-in user can open (membership), including archived sole after incorporate.
 */
export async function listMyWorkspaces(): Promise<WorkspaceOption[]> {
  const user = await requireTenantContext();

  const rows = await db()
    .select({
      tenantId: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      entityKind: tenants.entityKind,
      capabilityTier: tenants.capabilityTier,
      status: tenants.status,
      role: tenantMemberships.role,
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(
      and(
        eq(tenantMemberships.userId, user.id),
        isNull(tenantMemberships.voidedAt),
        eq(tenantMemberships.status, 'active'),
      ),
    )
    .orderBy(tenants.name);

  return rows.map((r) => {
    const entityKind = parseEntityKind(r.entityKind);
    return {
      tenantId: r.tenantId,
      name: r.name,
      slug: r.slug,
      entityKind,
      capabilityTier: r.capabilityTier,
      status: r.status ?? 'active',
      role: r.role,
      isCurrent: r.tenantId === user.tenantId,
      homePath: homePathForEntity(entityKind, r.capabilityTier),
    };
  });
}

/**
 * Switch active workspace (users.tenantId). Membership required.
 */
export async function switchWorkspace(tenantId: string): Promise<
  { ok: true; homePath: string } | { ok: false; error: string }
> {
  try {
    const user = await requireTenantContext();
    if (!tenantId) return { ok: false, error: 'Missing workspace.' };

    const [membership] = await db()
      .select({
        id: tenantMemberships.id,
        entityKind: tenants.entityKind,
        capabilityTier: tenants.capabilityTier,
        status: tenants.status,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(
        and(
          eq(tenantMemberships.userId, user.id),
          eq(tenantMemberships.tenantId, tenantId),
          isNull(tenantMemberships.voidedAt),
          eq(tenantMemberships.status, 'active'),
        ),
      )
      .limit(1);

    if (!membership) {
      return { ok: false, error: 'You do not have access to that workspace.' };
    }

    await db().update(users).set({ tenantId }).where(eq(users.id, user.id));

    const entityKind = parseEntityKind(membership.entityKind);
    const homePath = homePathForEntity(entityKind, membership.capabilityTier);

    revalidatePath('/');
    revalidatePath('/cashbook');
    revalidatePath('/control-room');

    return { ok: true, homePath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Switch failed' };
  }
}

export async function workspaceKindLabel(
  entityKind: string,
  capabilityTier?: string | null,
): Promise<string> {
  const k = parseEntityKind(entityKind);
  if (k === 'personal') return 'Personal';
  if (k === 'sole_prop') {
    return canAccessFullErp(k, capabilityTier) ? 'Sole prop · Full' : 'Sole prop · Lite';
  }
  if (k === 'pending') return 'Pending setup';
  return 'Company';
}
