'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import {
  JOB_TEMPLATES,
  PRIVILEGED_KEYS,
  SCREEN_DEFS,
  loadAccessForUser,
  requireTenantContext,
  scopeIgnoresJob,
  seedJobsForTenant,
  type PermissionKey,
} from '@bookone/auth';
import {
  and,
  auditLog,
  db,
  desc,
  eq,
  inArray,
  isNull,
  sql,
  tenantInvites,
  tenantMembershipRoles,
  tenantMemberships,
  tenantPermissionOverrides,
  tenantRolePermissions,
  tenantRoles,
  tenantMembershipScopes,
  tenantTeamMembers,
  tenantTeams,
  tenants,
  users,
  brands,
  locations,
  withTenantContext,
} from '@bookone/db';
import { assertPermission, getMyAccess } from '@/lib/access';
import { parseEntityKind } from '@/lib/entity-kind';
import { teamSeatCap } from '@/lib/team-seats';
import { grantsHaveBillAndPay, teamSodArmed } from '@/lib/team-sod';

function revalidateTeam() {
  revalidatePath('/company/team', 'layout');
  revalidatePath('/company/team/jobs');
  revalidatePath('/company/team/groups');
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
    const extras = await db()
      .select({
        membershipId: tenantMembershipRoles.membershipId,
        extraName: tenantRoles.name,
        extraSlug: tenantRoles.slug,
      })
      .from(tenantMembershipRoles)
      .innerJoin(tenantRoles, eq(tenantRoles.id, tenantMembershipRoles.roleId))
      .where(and(eq(tenantMembershipRoles.tenantId, user.tenantId), isNull(tenantMembershipRoles.voidedAt)));
    const extraByMem = new Map(extras.map((e) => [e.membershipId, e]));
    return rows.map((r) => ({
      ...r,
      extraName: extraByMem.get(r.membershipId)?.extraName ?? null,
      extraSlug: extraByMem.get(r.membershipId)?.extraSlug ?? null,
    }));
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
    const screens = SCREEN_DEFS.map((s) => {
        const write = grantSet.has(`${s.keyPrefix}.write` as PermissionKey);
        const read = write || grantSet.has(`${s.keyPrefix}.read` as PermissionKey);
        const privileged = (PRIVILEGED_KEYS as readonly string[]).some((k) => k.startsWith(s.keyPrefix));
        return {
          ...s,
          level: (write ? 'write' : read ? 'read' : 'none') as 'none' | 'read' | 'write',
          locked: privileged,
        };
      });
    const grantKeys = screens.flatMap((s) =>
      s.level === 'write' ? [`${s.keyPrefix}.write`] : s.level === 'read' ? [`${s.keyPrefix}.read`] : [],
    );
    const sod =
      teamSodArmed({
        templateKey: role.templateKey,
        customized: Boolean(role.customizedAt),
        hasExtra: false,
      }) && grantsHaveBillAndPay(grantKeys);
    return { role, screens, sod };
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
      .where(
        and(
          eq(tenantInvites.tenantId, user.tenantId),
          eq(tenantInvites.status, 'pending'),
          isNull(tenantInvites.voidedAt),
          sql`${tenantInvites.expiresAt} > now()`,
        ),
      );
    const [tenantRow] = await db()
      .select({ plan: tenants.plan, entityKind: tenants.entityKind, capabilityTier: tenants.capabilityTier })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);
    const cap = teamSeatCap({
      entityKind: tenantRow?.entityKind ?? access?.entityKind,
      capabilityTier: tenantRow?.capabilityTier ?? access?.capabilityTier,
      plan: tenantRow?.plan,
    });
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
      .where(
        and(
          eq(tenantInvites.tenantId, user.tenantId),
          eq(tenantInvites.status, 'pending'),
          isNull(tenantInvites.voidedAt),
          sql`${tenantInvites.expiresAt} > now()`,
        ),
      );
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
    const [already] = await db()
      .select({ id: tenantTeamMembers.id })
      .from(tenantTeamMembers)
      .where(
        and(
          eq(tenantTeamMembers.teamId, teamId),
          eq(tenantTeamMembers.userId, userId),
          isNull(tenantTeamMembers.voidedAt),
        ),
      )
      .limit(1);
    if (already) return { ok: true as const, message: 'Already in this team.' };
    await db().insert(tenantTeamMembers).values({ tenantId: user.tenantId, teamId, userId });
    await audit(user.tenantId, user.id, 'CREATE', 'tenant_team_members', teamId, 'Added team member.');
  });
  revalidateTeam();
  return { ok: true as const, message: 'Added to team.' };
}

async function clearExtraIfMatches(tenantId: string, membershipId: string, roleId: string) {
  await db()
    .update(tenantMembershipRoles)
    .set({ voidedAt: new Date() })
    .where(
      and(
        eq(tenantMembershipRoles.membershipId, membershipId),
        eq(tenantMembershipRoles.roleId, roleId),
        isNull(tenantMembershipRoles.voidedAt),
      ),
    );
}

export async function listTeamsWithMembers() {
  await assertPermission('team.people.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const teams = await db()
      .select({
        id: tenantTeams.id,
        name: tenantTeams.name,
        roleId: tenantTeams.roleId,
        roleName: tenantRoles.name,
        roleSlug: tenantRoles.slug,
      })
      .from(tenantTeams)
      .leftJoin(tenantRoles, eq(tenantRoles.id, tenantTeams.roleId))
      .where(and(eq(tenantTeams.tenantId, user.tenantId), isNull(tenantTeams.voidedAt)));
    const members = await db()
      .select({
        id: tenantTeamMembers.id,
        teamId: tenantTeamMembers.teamId,
        userId: tenantTeamMembers.userId,
        name: users.name,
        email: users.email,
      })
      .from(tenantTeamMembers)
      .innerJoin(users, eq(users.id, tenantTeamMembers.userId))
      .where(and(eq(tenantTeamMembers.tenantId, user.tenantId), isNull(tenantTeamMembers.voidedAt)));
    return teams.map((t) => ({
      ...t,
      members: members.filter((m) => m.teamId === t.id),
    }));
  });
}

export async function removeTeamMember(formData: FormData) {
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
    await db()
      .update(tenantTeamMembers)
      .set({ voidedAt: new Date() })
      .where(
        and(
          eq(tenantTeamMembers.teamId, teamId),
          eq(tenantTeamMembers.userId, userId),
          isNull(tenantTeamMembers.voidedAt),
        ),
      );
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
    if (membership) await clearExtraIfMatches(user.tenantId, membership.id, team.roleId);
    await audit(user.tenantId, user.id, 'DELETE', 'tenant_team_members', teamId, 'Removed team member.');
  });
  revalidateTeam();
  return { ok: true as const, message: 'Removed from team.' };
}

export async function voidTeam(formData: FormData) {
  await assertPermission('team.people.write', 'write');
  const user = await requireTenantContext();
  const teamId = String(formData.get('teamId') ?? '');
  await withTenantContext(user.tenantId, async () => {
    const [team] = await db()
      .select()
      .from(tenantTeams)
      .where(and(eq(tenantTeams.id, teamId), eq(tenantTeams.tenantId, user.tenantId), isNull(tenantTeams.voidedAt)))
      .limit(1);
    if (!team) throw new Error('Team not found.');
    const members = await db()
      .select({ userId: tenantTeamMembers.userId })
      .from(tenantTeamMembers)
      .where(and(eq(tenantTeamMembers.teamId, teamId), isNull(tenantTeamMembers.voidedAt)));
    await db()
      .update(tenantTeamMembers)
      .set({ voidedAt: new Date() })
      .where(and(eq(tenantTeamMembers.teamId, teamId), isNull(tenantTeamMembers.voidedAt)));
    for (const m of members) {
      const [membership] = await db()
        .select({ id: tenantMemberships.id })
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.tenantId, user.tenantId),
            eq(tenantMemberships.userId, m.userId),
            isNull(tenantMemberships.voidedAt),
          ),
        )
        .limit(1);
      if (membership) await clearExtraIfMatches(user.tenantId, membership.id, team.roleId);
    }
    await db().update(tenantTeams).set({ voidedAt: new Date(), updatedAt: new Date() }).where(eq(tenantTeams.id, teamId));
    await audit(user.tenantId, user.id, 'DELETE', 'tenant_teams', teamId, `Removed team ${team.name}.`);
  });
  revalidateTeam();
  return { ok: true as const, message: 'Team removed.' };
}

export async function setExtraJob(formData: FormData) {
  await assertPermission('team.people.write', 'write');
  const user = await requireTenantContext();
  const membershipId = String(formData.get('membershipId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');
  await withTenantContext(user.tenantId, async () => {
    await db()
      .update(tenantMembershipRoles)
      .set({ voidedAt: new Date() })
      .where(and(eq(tenantMembershipRoles.membershipId, membershipId), isNull(tenantMembershipRoles.voidedAt)));
    if (!roleId) {
      await audit(user.tenantId, user.id, 'UPDATE', 'tenant_memberships', membershipId, 'Cleared extra job.');
      return;
    }
    const [job] = await db()
      .select()
      .from(tenantRoles)
      .where(and(eq(tenantRoles.id, roleId), eq(tenantRoles.tenantId, user.tenantId), isNull(tenantRoles.voidedAt)))
      .limit(1);
    if (!job) throw new Error('Job not found.');
    if (job.templateKey === 'owner' || job.templateKey === 'admin') {
      throw new Error('Owner and Admin cannot be extra jobs.');
    }
    await db().insert(tenantMembershipRoles).values({
      tenantId: user.tenantId,
      membershipId,
      roleId,
    });
    await audit(user.tenantId, user.id, 'UPDATE', 'tenant_memberships', membershipId, `Extra job ${job.name}.`);
  });
  revalidateTeam();
  return { ok: true as const, message: roleId ? 'Extra job saved.' : 'Extra job cleared.' };
}

export async function savePersonOverrides(formData: FormData) {
  await assertPermission('team.people.write', 'write');
  const actor = await requireTenantContext();
  const userId = String(formData.get('userId') ?? '');
  await withTenantContext(actor.tenantId, async () => {
    await db()
      .update(tenantPermissionOverrides)
      .set({ voidedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(tenantPermissionOverrides.tenantId, actor.tenantId),
          eq(tenantPermissionOverrides.userId, userId),
          isNull(tenantPermissionOverrides.voidedAt),
        ),
      );
    const rows: { tenantId: string; userId: string; permissionKey: string; effect: string }[] = [];
    for (const screen of SCREEN_DEFS) {
      if ((PRIVILEGED_KEYS as readonly string[]).some((k) => k.startsWith(screen.keyPrefix))) continue;
      const v = String(formData.get(`ex_${screen.keyPrefix}`) ?? 'inherit');
      if (v === 'allow') {
        rows.push({
          tenantId: actor.tenantId,
          userId,
          permissionKey: screen.writeable ? `${screen.keyPrefix}.write` : `${screen.keyPrefix}.read`,
          effect: 'allow',
        });
      } else if (v === 'deny') {
        rows.push({ tenantId: actor.tenantId, userId, permissionKey: `${screen.keyPrefix}.read`, effect: 'deny' });
        if (screen.writeable) {
          rows.push({ tenantId: actor.tenantId, userId, permissionKey: `${screen.keyPrefix}.write`, effect: 'deny' });
        }
      }
    }
    if (rows.length) await db().insert(tenantPermissionOverrides).values(rows);
    await audit(actor.tenantId, actor.id, 'UPDATE', 'tenant_permission_overrides', userId, 'Updated access exceptions.');
  });
  revalidateTeam();
  return { ok: true as const, message: 'Exceptions saved.' };
}

export async function getPersonAccess(userId: string) {
  await assertPermission('team.people.read', 'read');
  const actor = await requireTenantContext();
  return withTenantContext(actor.tenantId, async () => {
    const [person] = await db()
      .select({
        membershipId: tenantMemberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        status: tenantMemberships.status,
        role: tenantMemberships.role,
        primaryRoleId: tenantMemberships.primaryRoleId,
        usersRole: users.role,
        jobName: tenantRoles.name,
        jobSlug: tenantRoles.slug,
        templateKey: tenantRoles.templateKey,
        customizedAt: tenantRoles.customizedAt,
      })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .leftJoin(tenantRoles, eq(tenantRoles.id, tenantMemberships.primaryRoleId))
      .where(
        and(
          eq(tenantMemberships.tenantId, actor.tenantId),
          eq(tenantMemberships.userId, userId),
          isNull(tenantMemberships.voidedAt),
        ),
      )
      .limit(1);
    if (!person) return null;
    const [extra] = await db()
      .select({
        roleId: tenantMembershipRoles.roleId,
        name: tenantRoles.name,
        slug: tenantRoles.slug,
        templateKey: tenantRoles.templateKey,
      })
      .from(tenantMembershipRoles)
      .innerJoin(tenantRoles, eq(tenantRoles.id, tenantMembershipRoles.roleId))
      .where(and(eq(tenantMembershipRoles.membershipId, person.membershipId), isNull(tenantMembershipRoles.voidedAt)))
      .limit(1);
    const overrideRows = await db()
      .select({
        permissionKey: tenantPermissionOverrides.permissionKey,
        effect: tenantPermissionOverrides.effect,
      })
      .from(tenantPermissionOverrides)
      .where(
        and(
          eq(tenantPermissionOverrides.tenantId, actor.tenantId),
          eq(tenantPermissionOverrides.userId, userId),
          isNull(tenantPermissionOverrides.voidedAt),
        ),
      );
    const platformRole = person.usersRole === 'super_admin' ? 'super_admin' : 'user';
    const access = await loadAccessForUser(userId, actor.tenantId, platformRole);
    const preview = SCREEN_DEFS.map((s) => {
      const level = access?.allows(`${s.keyPrefix}.write`, 'write')
        ? 'write'
        : access?.allows(`${s.keyPrefix}.read`, 'read')
          ? 'read'
          : 'none';
      const privileged = (PRIVILEGED_KEYS as readonly string[]).some((k) => k.startsWith(s.keyPrefix));
      return { label: s.label, href: s.href, module: s.module, keyPrefix: s.keyPrefix, writeable: s.writeable, level, privileged };
    });
    const grantKeys = preview.flatMap((s) =>
      s.level === 'write' ? [`${s.keyPrefix}.write`] : s.level === 'read' ? [`${s.keyPrefix}.read`] : [],
    );
    const sod =
      teamSodArmed({
        templateKey: person.templateKey,
        customized: Boolean(person.customizedAt),
        hasExtra: Boolean(extra),
      }) && grantsHaveBillAndPay(grantKeys);
    const exceptionByPrefix: Record<string, 'allow' | 'deny'> = {};
    for (const row of overrideRows) {
      const prefix = row.permissionKey.replace(/\.(read|write)$/, '');
      if (row.effect === 'deny') exceptionByPrefix[prefix] = 'deny';
      else if (row.effect === 'allow' && exceptionByPrefix[prefix] !== 'deny') exceptionByPrefix[prefix] = 'allow';
    }
    let scopeRows: { scopeType: string; targetId: string }[] = [];
    try {
      scopeRows = await db()
        .select({
          scopeType: tenantMembershipScopes.scopeType,
          targetId: tenantMembershipScopes.targetId,
        })
        .from(tenantMembershipScopes)
        .where(and(eq(tenantMembershipScopes.membershipId, person.membershipId), isNull(tenantMembershipScopes.voidedAt)));
    } catch {
      scopeRows = [];
    }
    const scopeLocationIds = scopeRows.filter((r) => r.scopeType === 'location').map((r) => r.targetId);
    const scopeBrandIds = scopeRows.filter((r) => r.scopeType === 'brand').map((r) => r.targetId);
    const brandRows = await db()
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(and(eq(brands.tenantId, actor.tenantId), isNull(brands.voidedAt)));
    const locationRows = await db()
      .select({ id: locations.id, name: locations.name, locationType: locations.locationType })
      .from(locations)
      .where(and(eq(locations.tenantId, actor.tenantId), isNull(locations.voidedAt)));
    const shopLocations = locationRows.filter(
      (l) => l.locationType !== 'on_rent' && l.locationType !== 'repair' && l.locationType !== 'wash',
    );
    return {
      person,
      extra: extra ?? null,
      exceptionByPrefix,
      preview,
      sod,
      scopeLocationIds,
      scopeBrandIds,
      brands: brandRows,
      locations: shopLocations.map((l) => ({ id: l.id, name: l.name })),
      scopeLocked: scopeIgnoresJob(person.templateKey),
    };
  });
}

export async function savePersonScope(formData: FormData) {
  await assertPermission('team.people.write', 'write');
  const actor = await requireTenantContext();
  const membershipId = String(formData.get('membershipId') ?? '');
  const locationIds = formData.getAll('locationId').map(String).filter(Boolean);
  const brandIds = formData.getAll('brandId').map(String).filter(Boolean);
  await withTenantContext(actor.tenantId, async () => {
    const [membership] = await db()
      .select({ id: tenantMemberships.id, templateKey: tenantRoles.templateKey })
      .from(tenantMemberships)
      .leftJoin(tenantRoles, eq(tenantRoles.id, tenantMemberships.primaryRoleId))
      .where(and(eq(tenantMemberships.id, membershipId), eq(tenantMemberships.tenantId, actor.tenantId)))
      .limit(1);
    if (!membership) throw new Error('Person not found.');
    if (scopeIgnoresJob(membership.templateKey)) {
      throw new Error('Owner and Admin always see every shop.');
    }
    await db()
      .update(tenantMembershipScopes)
      .set({ voidedAt: new Date() })
      .where(and(eq(tenantMembershipScopes.membershipId, membershipId), isNull(tenantMembershipScopes.voidedAt)));
    const rows = [
      ...locationIds.map((id) => ({
        tenantId: actor.tenantId,
        membershipId,
        scopeType: 'location' as const,
        targetId: id,
      })),
      ...brandIds.map((id) => ({
        tenantId: actor.tenantId,
        membershipId,
        scopeType: 'brand' as const,
        targetId: id,
      })),
    ];
    if (rows.length) await db().insert(tenantMembershipScopes).values(rows);
    await audit(actor.tenantId, actor.id, 'UPDATE', 'tenant_membership_scopes', membershipId, 'Updated shop scope.');
  });
  revalidateTeam();
  return { ok: true as const, message: 'Shops saved.' };
}

export async function getSeatUsage() {
  await assertPermission('team.people.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [tenantRow] = await db()
      .select({ plan: tenants.plan, entityKind: tenants.entityKind, capabilityTier: tenants.capabilityTier })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);
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
      .where(
        and(
          eq(tenantInvites.tenantId, user.tenantId),
          eq(tenantInvites.status, 'pending'),
          isNull(tenantInvites.voidedAt),
          sql`${tenantInvites.expiresAt} > now()`,
        ),
      );
    const cap = teamSeatCap({
      entityKind: tenantRow?.entityKind,
      capabilityTier: tenantRow?.capabilityTier,
      plan: tenantRow?.plan,
    });
    return { used: Number(live ?? 0) + Number(pending ?? 0), cap };
  });
}

export async function listAccessHistory() {
  await assertPermission('team.people.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const tables = [
      'tenant_roles',
      'tenant_memberships',
      'tenant_invites',
      'tenant_teams',
      'tenant_team_members',
      'tenant_permission_overrides',
      'tenant_membership_scopes',
    ];
    return db()
      .select({
        id: auditLog.id,
        action: auditLog.action,
        tableName: auditLog.tableName,
        notes: auditLog.notes,
        createdAt: auditLog.createdAt,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(eq(auditLog.tenantId, user.tenantId), inArray(auditLog.tableName, tables)))
      .orderBy(desc(auditLog.createdAt))
      .limit(40);
  });
}
