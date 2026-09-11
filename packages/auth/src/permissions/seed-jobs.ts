import { and, db, eq, isNull, tenantMemberships, tenantRoles } from '@bookone/db';
import { CATALOG_VERSION } from './catalog';
import { JOB_TEMPLATES } from './templates';

export async function seedJobsForTenant(tenantId: string): Promise<void> {
  const existing = await db()
    .select({ slug: tenantRoles.slug })
    .from(tenantRoles)
    .where(and(eq(tenantRoles.tenantId, tenantId), isNull(tenantRoles.voidedAt)));
  const have = new Set(existing.map((r) => r.slug));
  for (const job of JOB_TEMPLATES) {
    if (have.has(job.slug)) continue;
    await db().insert(tenantRoles).values({
      tenantId,
      name: job.name,
      slug: job.slug,
      templateKey: job.key,
      templateVersion: String(CATALOG_VERSION),
      isLocked: job.key === 'owner' ? '1' : '0',
    });
  }
}

export async function ensureOwnerMembership(tenantId: string, userId: string): Promise<void> {
  await seedJobsForTenant(tenantId);
  const [existing] = await db()
    .select({ id: tenantMemberships.id })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.userId, userId),
        isNull(tenantMemberships.voidedAt),
      ),
    )
    .limit(1);
  const [owner] = await db()
    .select({ id: tenantRoles.id })
    .from(tenantRoles)
    .where(and(eq(tenantRoles.tenantId, tenantId), eq(tenantRoles.slug, 'owner'), isNull(tenantRoles.voidedAt)))
    .limit(1);
  if (existing) {
    if (owner) {
      await db()
        .update(tenantMemberships)
        .set({ primaryRoleId: owner.id, role: 'owner' })
        .where(and(eq(tenantMemberships.id, existing.id), isNull(tenantMemberships.primaryRoleId)));
    }
    return;
  }
  await db().insert(tenantMemberships).values({
    tenantId,
    userId,
    role: 'owner',
    primaryRoleId: owner?.id ?? null,
    status: 'active',
  });
}
