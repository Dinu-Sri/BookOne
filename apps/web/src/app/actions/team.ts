'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import {
  JOB_TEMPLATES,
  PRIVILEGED_KEYS,
  SCREEN_DEFS,
  requireTenantContext,
  seedJobsForTenant,
  type PermissionKey,
} from '@bookone/auth';
import {
  and,
  auditLog,
  db,
  eq,
  isNull,
  sql,
  tenantInvites,
  tenantMembershipRoles,
  tenantMemberships,
  tenantPermissionOverrides,
  tenantRolePermissions,
  tenantRoles,
  tenantTeamMembers,
  tenantTeams,
  users,
  withTenantContext,
} from '@bookone/db';
import { assertPermission, getMyAccess } from '@/lib/access';
import { parseEntityKind } from '@/lib/entity-kind';

function revalidateTeam() {
  revalidatePath('/company/team');
  revalidatePath('/company/team/jobs');
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function audit(tenantId: string, userId: string, action: string, tableName: string, recordId: string, notes: string) {
  await db().insert(auditLog).values({
    tenantId,
    userId,
    action,
    tableName,
    recordId,
    notes,
  });
}

export async function listTeamPeople() {
  const user = await requireTenantContext();
  await assertPermission('team.people.read', 'read');
  return withTenantContext(user.tenantId, async () => {
    await seedJobsForTenant(user.tenantId);
    const rows = await db()
      .select({
        membershipId: tenantMemberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        status: tenantMemberships.status,
        role: tenantMemberships.role,
        primaryRoleId: tenantMemberships.primaryRoleId,
        jobName: tenantRoles.name,
        jobSlug: tenantRoles.slug,
      })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .leftJoin(tenantRoles, eq(tenantRoles.id, tenantMemberships.primaryRoleId))
      .where(and(eq(tenantMemberships.tenantId, user.tenantId), isNull(tenantMemberships.voidedAt)));
    return rows;
  });
}

export async function listTeamJobs() {
  const user = await requireTenantContext();
  await assertPermission('team.jobs.read', 'read');
  return withTenantContext(user.tenantId, async () => {
    await seedJobsForTenant(user.tenantId);
    return db()
      .select({
        id: tenantRoles.id,
        name: tenantRoles.name,
        slug: tenantRoles.slug,
        templateKey: tenantRoles.templateKey,
        customizedAt: tenantRoles.customizedAt,
        isLocked: tenantRoles.isLocked,
      })
      .from(tenantRoles)
      .where(and(eq(tenantRoles.tenantId, user.tenantId), isNull(tenantRoles.voidedAt)));
  });
}

export async function listJobMatrix(roleId: string) {
  await assertPermission('team.jobs.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [role] = await db()
      .select()
      .from(tenantRoles)
      .where(and(eq(tenantRoles.id, roleId), eq(tenantRoles.tenantId, user.tenantId), isNull(tenantRoles.voidedAt)))
      .limit(1);
    if (!role) throw new Error('Job not found.');
    const tmpl = JOB_TEMPLATES.find((t) => t.key === role.templateKey);
    const grantSet = new Set(tmpl?.grants ?? []);
    if (role.customizedAt) {
      grantSet.clear();
      const rows = await db()
        .select({ permissionKey: tenantRolePermissions.permissionKey, level: tenantRolePermissions.level })
        .from(tenantRolePermissions)
        .where(and(eq(tenantRolePermissions.roleId, roleId), isNull(tenantRolePermissions.voidedAt)));
      for (const r of rows) grantSet.add(r.permissionKey as PermissionKey);
    }
    return {
      role,
      screens: SCREEN_DEFS.map((s) => {
        const write = grantSet.has(`${s.keyPrefix}.write` as PermissionKey);
        const read = write || grantSet.has(`${s.keyPrefix}.read` as PermissionKey);
        const privileged = (PRIVILEGED_KEYS as readonly string[]).some((k) => k.startsWith(s.keyPrefix));
        return {
          ...s,
          level: (write ? 'write' : read ? 'read' : 'none') as 'none' | 'read' | 'write',
          locked: privileged,
        };
      }),
    };
  });
}

export async function saveJobMatrix(formData: FormData) {
  await assertPermission('team.jobs.write', 'write');
  const user = await requireTenantContext();
  const roleId = String(formData.get('roleId') ?? '');
  await withTenantContext(user.tenantId, async () => {
    const [role] = await db()
      .select()
      .from(tenantRoles)
      .where(and(eq(tenantRoles.id, roleId), eq(tenantRoles.tenantId, user.tenantId)))
      .limit(1);
    if (!role) throw new Error('Job not found.');
    if (role.templateKey === 'owner' && user.jobSlug !== 'owner') {
      throw new Error('Only the owner can change the Owner job.');
    }
    const grants: { key: string; level: 'read' | 'write' }[] = [];
    for (const screen of SCREEN_DEFS) {
      if ((PRIVILEGED_KEYS as readonly string[]).some((k) => k.startsWith(screen.keyPrefix))) continue;
      const v = String(formData.get(`perm_${screen.keyPrefix}`) ?? 'none');
      if (v === 'write' && screen.writeable) grants.push({ key: `${screen.keyPrefix}.write`, level: 'write' });
      else if (v === 'read' || v === 'write') grants.push({ key: `${screen.keyPrefix}.read`, level: 'read' });
    }
    await db()
      .update(tenantRolePermissions)
      .set({ voidedAt: new Date() })
      .where(and(eq(tenantRolePermissions.roleId, roleId), isNull(tenantRolePermissions.voidedAt)));
    if (grants.length) {
      await db().insert(tenantRolePermissions).values(
        grants.map((g) => ({
          tenantId: user.tenantId,
          roleId,
          permissionKey: g.key,
          level: g.level,
        })),
      );
    }
    await db()
      .update(tenantRoles)
      .set({ customizedAt: new Date(), updatedAt: new Date() })
      .where(eq(tenantRoles.id, roleId));
    await audit(user.tenantId, user.id, 'UPDATE', 'tenant_roles', roleId, `Saved job matrix for ${role.name}.`);
  });
  revalidateTeam();
  return { ok: true as const, message: 'Job saved.' };
}

export async function assignJob(formData: FormData) {
  await assertPermission('team.people.write', 'write');
  const user = await requireTenantContext();
  const membershipId = String(formData.get('membershipId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');
  const asExtra = String(formData.get('asExtra') ?? '') === '1';
  await withTenantContext(user.tenantId, async () => {
    const [job] = await db()
      .select()
      .from(tenantRoles)
      .where(and(eq(tenantRoles.id, roleId), eq(tenantRoles.tenantId, user.tenantId), isNull(tenantRoles.voidedAt)))
      .limit(1);
    if (!job) throw new Error('Job not found.');
    if ((job.templateKey === 'owner' || job.slug === 'owner') && user.jobSlug !== 'owner') {
      throw new Error('Only the owner can transfer ownership.');
    }
    if (asExtra && (job.templateKey === 'owner' || job.templateKey === 'admin')) {
      throw new Error('Owner and Admin cannot be extra jobs.');
    }
    if (!asExtra && (job.templateKey === 'owner' || job.slug === 'owner')) {
      const [owners] = await db()
        .select({ total: sql<number>`count(*)` })
        .from(tenantMemberships)
        .innerJoin(tenantRoles, eq(tenantRoles.id, tenantMemberships.primaryRoleId))
        .where(
          and(
            eq(tenantMemberships.tenantId, user.tenantId),
            isNull(tenantMemberships.voidedAt),
            eq(tenantMemberships.status, 'active'),
            eq(tenantRoles.templateKey, 'owner'),
          ),
        );
      if (Number(owners?.total ?? 0) <= 1) {
        const [target] = await db()
          .select({ primaryRoleId: tenantMemberships.primaryRoleId })
          .from(tenantMemberships)
          .where(eq(tenantMemberships.id, membershipId))
          .limit(1);
        const [cur] = await db()
          .select({ templateKey: tenantRoles.templateKey })
          .from(tenantRoles)
          .where(eq(tenantRoles.id, target?.primaryRoleId ?? ''))
          .limit(1);
        if (cur?.templateKey === 'owner' && job.templateKey !== 'owner') {
          throw new Error('The last owner cannot be demoted.');
        }
      }
    }
    if (asExtra) {
      await db()
        .update(tenantMembershipRoles)
        .set({ voidedAt: new Date() })
        .where(
          and(eq(tenantMembershipRoles.membershipId, membershipId), isNull(tenantMembershipRoles.voidedAt)),
        );
      await db().insert(tenantMembershipRoles).values({
        tenantId: user.tenantId,
        membershipId,
        roleId,
      });
    } else {
      await db()
        .update(tenantMemberships)
        .set({ primaryRoleId: roleId, role: job.slug, updatedAt: new Date() })
        .where(eq(tenantMemberships.id, membershipId));
    }
    await audit(user.tenantId, user.id, 'UPDATE', 'tenant_memberships', membershipId, `Assigned job ${job.name}.`);
  });
  revalidateTeam();
  return { ok: true as const, message: 'Job assigned.' };
}

export async function deactivateMember(formData: FormData) {
  await assertPermission('team.people.write', 'write');
  const user = await requireTenantContext();
  const membershipId = String(formData.get('membershipId') ?? '');
  await withTenantContext(user.tenantId, async () => {
    const [row] = await db()
      .select({
        id: tenantMemberships.id,
        userId: tenantMemberships.userId,
        templateKey: tenantRoles.templateKey,
      })
      .from(tenantMemberships)
      .leftJoin(tenantRoles, eq(tenantRoles.id, tenantMemberships.primaryRoleId))
      .where(and(eq(tenantMemberships.id, membershipId), eq(tenantMemberships.tenantId, user.tenantId)))
      .limit(1);
    if (!row) throw new Error('Person not found.');
    if (row.templateKey === 'owner') {
      if (user.jobSlug !== 'owner') throw new Error('Only the owner can deactivate another owner.');
      const [owners] = await db()
        .select({ total: sql<number>`count(*)` })
        .from(tenantMemberships)
        .innerJoin(tenantRoles, eq(tenantRoles.id, tenantMemberships.primaryRoleId))
        .where(
          and(
            eq(tenantMemberships.tenantId, user.tenantId),
            isNull(tenantMemberships.voidedAt),
            eq(tenantMemberships.status, 'active'),
            eq(tenantRoles.templateKey, 'owner'),
          ),
        );
      if (Number(owners?.total ?? 0) <= 1) throw new Error('The last owner cannot be deactivated.');
    }
    await db()
      .update(tenantMemberships)
      .set({ status: 'disabled', voidedAt: new Date(), updatedAt: new Date() })
      .where(eq(tenantMemberships.id, membershipId));
    await audit(user.tenantId, user.id, 'DELETE', 'tenant_memberships', membershipId, 'Deactivated team member.');
  });
  revalidateTeam();
  return { ok: true as const, message: 'Person deactivated.' };
}

const SEAT_CAPS: Record<string, number> = {
  personal: 1,
  sole_lite: 2,
  sole_full: 5,
  starter: 5,
  growth: 15,
  pro: 50,
};

export async function inviteTeamMember(formData: FormData) {
  await assertPermission('team.people.write', 'write');
  const user = await requireTenantContext();
  const email = String(formData.get('email') ?? '')
    .toLowerCase()
    .trim();
  const roleId = String(formData.get('roleId') ?? '');
  if (!email || !email.includes('@')) return { ok: false as const, error: 'Enter a valid email.' };
  const access = await getMyAccess();
  const kind = parseEntityKind(access?.entityKind);
  if (kind === 'personal') return { ok: false as const, error: 'Personal books cannot add a team.' };

  return withTenantContext(user.tenantId, async () => {
    const [job] = await db()
      .select()
      .from(tenantRoles)
      .where(and(eq(tenantRoles.id, roleId), eq(tenantRoles.tenantId, user.tenantId), isNull(tenantRoles.voidedAt)))
      .limit(1);
    if (!job) return { ok: false as const, error: 'Pick a job.' };
    if (job.templateKey === 'owner' && user.jobSlug !== 'owner') {
      return { ok: false as const, error: 'Only the owner can invite another owner.' };
    }

    const [{ total: live }] = await db()
      .select({ total: sql<number>`count(*)` })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, user.tenantId),
          isNull(tenantMemberships.voidedAt),
          eq(tenantMemberships.status, 'active'),
        ),
      );
    const [{ total: pending }] = await db()
      .select({ total: sql<number>`count(*)` })
      .from(tenantInvites)
      .where(and(eq(tenantInvites.tenantId, user.tenantId), eq(tenantInvites.status, 'pending'), isNull(tenantInvites.voidedAt)));
    const capKey =
      kind === 'sole_prop' ? (access?.capabilityTier === 'full' ? 'sole_full' : 'sole_lite') : access?.modules ? 'starter' : 'starter';
    const cap = SEAT_CAPS[capKey] ?? 5;
    if (Number(live ?? 0) + Number(pending ?? 0) >= cap) {
      return { ok: false as const, error: `This workspace can have up to ${cap} people.` };
    }

    const token = randomBytes(32).toString('hex');
    const hash = tokenHash(token);
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [invite] = await db()
      .insert(tenantInvites)
      .values({
        tenantId: user.tenantId,
        email,
        roleId,
        invitedBy: user.id,
        tokenHash: hash,
        status: 'pending',
        expiresAt: expires,
      })
      .returning({ id: tenantInvites.id });
    await audit(user.tenantId, user.id, 'CREATE', 'tenant_invites', invite.id, `Invited ${email} as ${job.name}.`);
    revalidateTeam();
    const base = process.env.AUTH_URL || process.env.APP_URL || '';
    const url = `${base.replace(/\/$/, '')}/invite/${token}`;
    return { ok: true as const, message: 'Invite created. Share this link with them.', url };
  });
}

export async function listPendingInvites() {
  await assertPermission('team.people.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    return db()
      .select({
        id: tenantInvites.id,
        email: tenantInvites.email,
        status: tenantInvites.status,
        expiresAt: tenantInvites.expiresAt,
        roleName: tenantRoles.name,
      })
      .from(tenantInvites)
      .leftJoin(tenantRoles, eq(tenantRoles.id, tenantInvites.roleId))
      .where(and(eq(tenantInvites.tenantId, user.tenantId), eq(tenantInvites.status, 'pending'), isNull(tenantInvites.voidedAt)));
  });
}

export async function revokeInvite(formData: FormData) {
  await assertPermission('team.people.write', 'write');
  const user = await requireTenantContext();
  const id = String(formData.get('id') ?? '');
  await withTenantContext(user.tenantId, async () => {
    await db()
      .update(tenantInvites)
      .set({ status: 'revoked', voidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tenantInvites.id, id), eq(tenantInvites.tenantId, user.tenantId)));
    await audit(user.tenantId, user.id, 'DELETE', 'tenant_invites', id, 'Revoked invite.');
  });
  revalidateTeam();
}

export async function listTeams() {
  await assertPermission('team.people.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    return db()
      .select({
        id: tenantTeams.id,
        name: tenantTeams.name,
        roleId: tenantTeams.roleId,
        roleName: tenantRoles.name,
      })
      .from(tenantTeams)
      .leftJoin(tenantRoles, eq(tenantRoles.id, tenantTeams.roleId))
      .where(and(eq(tenantTeams.tenantId, user.tenantId), isNull(tenantTeams.voidedAt)));
  });
}

export async function saveTeam(formData: FormData) {
  await assertPermission('team.people.write', 'write');
  const user = await requireTenantContext();
  const name = String(formData.get('name') ?? '').trim();
  const roleId = String(formData.get('roleId') ?? '');
  if (!name) return { ok: false as const, error: 'Enter a team name.' };
  return withTenantContext(user.tenantId, async () => {
    const [job] = await db()
      .select()
      .from(tenantRoles)
      .where(and(eq(tenantRoles.id, roleId), eq(tenantRoles.tenantId, user.tenantId)))
      .limit(1);
    if (!job) return { ok: false as const, error: 'Pick a job.' };
    if (job.templateKey === 'owner' || job.templateKey === 'admin') {
      return { ok: false as const, error: 'Teams cannot use Owner or Admin jobs.' };
    }
    const [created] = await db()
      .insert(tenantTeams)
      .values({ tenantId: user.tenantId, name, roleId })
      .returning({ id: tenantTeams.id });
    await audit(user.tenantId, user.id, 'CREATE', 'tenant_teams', created.id, `Created team ${name}.`);
    revalidateTeam();
    return { ok: true as const, message: 'Team added.' };
  });
}

export async function addTeamMember(formData: FormData) {
  await assertPermission('team.people.write', 'write');
  const user = await requireTenantContext();
  const teamId = String(formData.get('teamId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  await withTenantContext(user.tenantId, async () => {
    const [team] = await db()
      .select()
      .from(tenantTeams)
      .where(and(eq(tenantTeams.id, teamId), eq(tenantTeams.tenantId, user.tenantId)))
      .limit(1);
    if (!team) throw new Error('Team not found.');
    const [membership] = await db()
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, user.tenantId),
          eq(tenantMemberships.userId, userId),
          isNull(tenantMemberships.voidedAt),
        ),
      )
      .limit(1);
    if (!membership) throw new Error('Person is not in this workspace.');
    const [existingExtra] = await db()
      .select({ id: tenantMembershipRoles.id, roleId: tenantMembershipRoles.roleId })
      .from(tenantMembershipRoles)
      .where(and(eq(tenantMembershipRoles.membershipId, membership.id), isNull(tenantMembershipRoles.voidedAt)))
      .limit(1);
    if (existingExtra && existingExtra.roleId !== team.roleId) {
      throw new Error('This person already helps with another job. Remove that extra first.');
    }
    if (!existingExtra) {
      await db().insert(tenantMembershipRoles).values({
        tenantId: user.tenantId,
        membershipId: membership.id,
        roleId: team.roleId,
      });
    }
    await db().insert(tenantTeamMembers).values({ tenantId: user.tenantId, teamId, userId });
    await audit(user.tenantId, user.id, 'CREATE', 'tenant_team_members', teamId, 'Added team member.');
  });
  revalidateTeam();
  return { ok: true as const, message: 'Added to team.' };
}
