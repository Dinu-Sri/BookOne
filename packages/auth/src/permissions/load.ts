import { cache } from 'react';
import {
  and,
  db,
  eq,
  isNull,
  tenantMembershipRoles,
  tenantMemberships,
  tenantPermissionOverrides,
  tenantRolePermissions,
  tenantRoles,
  tenants,
} from '@bookone/db';
import type { AccessLevel } from './catalog';
import type { ModuleWriteKey } from './ceiling';
import { allows, type ResolveInput } from './resolve';
import { templateByKey } from './templates';
import type { PermissionKey } from './catalog';

export type LoadedAccess = ResolveInput & {
  tenantId: string;
  membershipId: string | null;
  jobId: string | null;
  jobSlug: string | null;
  jobName: string | null;
  allows: (key: string, need: 'read' | 'write') => boolean;
};

function grantsFromTemplate(templateKey: string | null): { key: string; level: AccessLevel }[] {
  const t = templateKey ? templateByKey(templateKey) : undefined;
  if (!t) return [];
  return t.grants.map((key) => ({
    key,
    level: (key.endsWith('.write') ? 'write' : 'read') as AccessLevel,
  }));
}

export async function loadAccessForUser(userId: string, tenantId: string, platformRole: 'super_admin' | 'user'): Promise<LoadedAccess | null> {
  const [tenant] = await db()
    .select({
      id: tenants.id,
      entityKind: tenants.entityKind,
      capabilityTier: tenants.capabilityTier,
      modules: tenants.modules,
      rbacEnforced: tenants.rbacEnforced,
      status: tenants.status,
      voidedAt: tenants.voidedAt,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant || tenant.voidedAt) return null;
  if (tenant.status === 'suspended') return null;

  const [membership] = await db()
    .select({
      id: tenantMemberships.id,
      role: tenantMemberships.role,
      status: tenantMemberships.status,
      primaryRoleId: tenantMemberships.primaryRoleId,
      voidedAt: tenantMemberships.voidedAt,
    })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.userId, userId),
        isNull(tenantMemberships.voidedAt),
      ),
    )
    .limit(1);

  if (!membership || membership.status !== 'active') return null;

  const roleIds = [membership.primaryRoleId].filter(Boolean) as string[];
  const [extra] = await db()
    .select({ roleId: tenantMembershipRoles.roleId })
    .from(tenantMembershipRoles)
    .where(
      and(
        eq(tenantMembershipRoles.tenantId, tenantId),
        eq(tenantMembershipRoles.membershipId, membership.id),
        isNull(tenantMembershipRoles.voidedAt),
      ),
    )
    .limit(1);
  if (extra?.roleId) roleIds.push(extra.roleId);

  const roles =
    roleIds.length === 0
      ? []
      : await db()
          .select({
            id: tenantRoles.id,
            slug: tenantRoles.slug,
            name: tenantRoles.name,
            templateKey: tenantRoles.templateKey,
            customizedAt: tenantRoles.customizedAt,
          })
          .from(tenantRoles)
          .where(and(eq(tenantRoles.tenantId, tenantId), isNull(tenantRoles.voidedAt)));

  const primary = roles.find((r) => r.id === membership.primaryRoleId) ?? null;
  const extraRole = extra ? roles.find((r) => r.id === extra.roleId) ?? null : null;

  const grants: { key: string; level: AccessLevel }[] = [];
  for (const role of [primary, extraRole]) {
    if (!role) continue;
    if (role.templateKey && !role.customizedAt) {
      grants.push(...grantsFromTemplate(role.templateKey));
      continue;
    }
    const rows = await db()
      .select({
        permissionKey: tenantRolePermissions.permissionKey,
        level: tenantRolePermissions.level,
      })
      .from(tenantRolePermissions)
      .where(
        and(
          eq(tenantRolePermissions.roleId, role.id),
          isNull(tenantRolePermissions.voidedAt),
        ),
      );
    for (const row of rows) {
      grants.push({
        key: row.permissionKey,
        level: row.level === 'write' ? 'write' : 'read',
      });
    }
  }

  const overrideRows = await db()
    .select({
      permissionKey: tenantPermissionOverrides.permissionKey,
      effect: tenantPermissionOverrides.effect,
    })
    .from(tenantPermissionOverrides)
    .where(
      and(
        eq(tenantPermissionOverrides.tenantId, tenantId),
        eq(tenantPermissionOverrides.userId, userId),
        isNull(tenantPermissionOverrides.voidedAt),
      ),
    );

  const modules = (tenant.modules ?? {}) as Partial<Record<ModuleWriteKey, boolean>>;
  const input: ResolveInput = {
    platformRole,
    rbacEnforced: Boolean(tenant.rbacEnforced),
    primaryTemplateKey: primary?.templateKey ?? primary?.slug ?? membership.role ?? null,
    extraTemplateKey: extraRole?.templateKey ?? extraRole?.slug ?? null,
    grants,
    overrides: overrideRows.map((o) => ({
      key: o.permissionKey,
      effect: o.effect === 'deny' ? 'deny' : 'allow',
    })),
    entityKind: tenant.entityKind,
    capabilityTier: tenant.capabilityTier,
    modules,
    legacyRole: membership.role,
  };

  return {
    ...input,
    tenantId,
    membershipId: membership.id,
    jobId: primary?.id ?? null,
    jobSlug: primary?.slug ?? membership.role ?? null,
    jobName: primary?.name ?? null,
    allows: (key, need) => allows(input, key as PermissionKey, need),
  };
}

export const getRequestAccess = cache(async function getRequestAccess(
  userId: string,
  tenantId: string,
  platformRole: 'super_admin' | 'user',
): Promise<LoadedAccess | null> {
  return loadAccessForUser(userId, tenantId, platformRole);
});
