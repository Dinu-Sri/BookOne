'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { DEFAULT_CHART_OF_ACCOUNTS } from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  companyProfiles,
  db,
  eq,
  desc,
  and,
  isNull,
  or,
  ilike,
  sql,
  tenantMemberships,
  tenants,
  users,
  platformAuditEvents,
} from '@bookone/db';
import {
  modulesForPlan,
  normalizeModules,
  type TenantModules,
  type PlanId,
  PLANS,
} from '@/lib/platform-modules';

const SUPER_EMAIL = 'dinu.sri.m@gmail.com';

export type PlatformCompanyRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  environment: string;
  status: string;
  modules: TenantModules;
  createdAt: string;
  userCount: number;
};

export type PlatformCompanyDetail = PlatformCompanyRow & {
  members: {
    membershipId: string;
    userId: string;
    email: string;
    name: string;
    role: string;
    status: string;
  }[];
  profile: {
    legalName: string | null;
    baseCurrency: string | null;
    timezone: string | null;
    country: string | null;
  } | null;
};

export type PlatformOverview = {
  counts: {
    total: number;
    active: number;
    suspended: number;
    staging: number;
    production: number;
  };
  recent: PlatformCompanyRow[];
  recentAudit: PlatformAuditRow[];
  appEnv: 'staging' | 'production';
};

export type PlatformAuditRow = {
  id: string;
  action: string;
  summary: string | null;
  targetTenantId: string | null;
  targetName: string | null;
  actorEmail: string | null;
  createdAt: string;
};

export type PlatformUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  createdAt: string;
};

function isSuperAdmin(user: { role: string; email: string }) {
  return user.role === 'super_admin' || user.email === SUPER_EMAIL;
}

async function requirePlatformAdmin() {
  const user = await requireTenantContext();
  if (!isSuperAdmin(user)) throw new Error('Platform console is restricted to super admin.');
  return user;
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
  for (let i = 0; i < 30; i += 1) {
    const candidate = i === 0 ? safeBase : `${safeBase}-${i + 1}`;
    const [existing] = await db()
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  return `${safeBase}-${Date.now()}`;
}

async function writeAudit(opts: {
  actorUserId: string;
  targetTenantId?: string | null;
  action: string;
  summary?: string;
  meta?: Record<string, unknown>;
}) {
  await db().insert(platformAuditEvents).values({
    actorUserId: opts.actorUserId,
    targetTenantId: opts.targetTenantId ?? null,
    action: opts.action,
    summary: opts.summary ?? null,
    meta: opts.meta ?? null,
  });
}

function mapModules(raw: unknown, plan: string): TenantModules {
  return normalizeModules(raw, plan);
}

async function loadCompanyRows(filter?: {
  q?: string;
  status?: string;
  plan?: string;
  environment?: string;
}): Promise<PlatformCompanyRow[]> {
  const conditions = [];
  if (filter?.status && filter.status !== 'all') {
    conditions.push(eq(tenants.status, filter.status));
  }
  if (filter?.plan && filter.plan !== 'all') {
    conditions.push(eq(tenants.plan, filter.plan));
  }
  if (filter?.environment && filter.environment !== 'all') {
    conditions.push(eq(tenants.environment, filter.environment));
  }
  if (filter?.q?.trim()) {
    const q = `%${filter.q.trim()}%`;
    conditions.push(or(ilike(tenants.name, q), ilike(tenants.slug, q))!);
  }

  const rows = await db()
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      environment: tenants.environment,
      status: tenants.status,
      modules: tenants.modules,
      createdAt: tenants.createdAt,
      userCount: sql<number>`(
        select count(*)::int from tenant_memberships m
        where m.tenant_id = ${tenants.id} and m.voided_at is null
      )`,
    })
    .from(tenants)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tenants.createdAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    plan: r.plan,
    environment: r.environment ?? 'production',
    status: r.status ?? 'active',
    modules: mapModules(r.modules, r.plan),
    createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
    userCount: Number(r.userCount ?? 0),
  }));
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  await requirePlatformAdmin();

  const [stats] = await db()
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where coalesce(${tenants.status}, 'active') = 'active')::int`,
      suspended: sql<number>`count(*) filter (where ${tenants.status} = 'suspended')::int`,
      staging: sql<number>`count(*) filter (where coalesce(${tenants.environment}, 'production') = 'staging')::int`,
      production: sql<number>`count(*) filter (where coalesce(${tenants.environment}, 'production') = 'production')::int`,
    })
    .from(tenants);

  const recent = await loadCompanyRows();
  const recentAudit = await listPlatformAudit(12);

  const appEnv =
    process.env.BOOKONE_ENV === 'staging' || process.env.NEXT_PUBLIC_BOOKONE_ENV === 'staging'
      ? 'staging'
      : 'production';

  return {
    counts: {
      total: Number(stats?.total ?? 0),
      active: Number(stats?.active ?? 0),
      suspended: Number(stats?.suspended ?? 0),
      staging: Number(stats?.staging ?? 0),
      production: Number(stats?.production ?? 0),
    },
    recent: recent.slice(0, 8),
    recentAudit,
    appEnv,
  };
}

export async function listPlatformCompanies(filter?: {
  q?: string;
  status?: string;
  plan?: string;
  environment?: string;
}): Promise<PlatformCompanyRow[]> {
  await requirePlatformAdmin();
  return loadCompanyRows(filter);
}

export async function getPlatformCompany(id: string): Promise<PlatformCompanyDetail | null> {
  await requirePlatformAdmin();

  const [row] = await db()
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      environment: tenants.environment,
      status: tenants.status,
      modules: tenants.modules,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);

  if (!row) return null;

  const members = await db()
    .select({
      membershipId: tenantMemberships.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: tenantMemberships.role,
      status: tenantMemberships.status,
    })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.tenantId, id), isNull(tenantMemberships.voidedAt)))
    .orderBy(desc(tenantMemberships.createdAt));

  const [profile] = await db()
    .select({
      legalName: companyProfiles.legalName,
      baseCurrency: companyProfiles.baseCurrency,
      timezone: companyProfiles.timezone,
      country: companyProfiles.country,
    })
    .from(companyProfiles)
    .where(and(eq(companyProfiles.tenantId, id), isNull(companyProfiles.voidedAt)))
    .limit(1);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    environment: row.environment ?? 'production',
    status: row.status ?? 'active',
    modules: mapModules(row.modules, row.plan),
    createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
    userCount: members.length,
    members: members.map((m) => ({
      membershipId: m.membershipId,
      userId: m.userId,
      email: m.email,
      name: m.name,
      role: m.role,
      status: m.status,
    })),
    profile: profile
      ? {
          legalName: profile.legalName,
          baseCurrency: profile.baseCurrency,
          timezone: profile.timezone,
          country: profile.country,
        }
      : null,
  };
}

export async function createPlatformCompanyFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();

  const name = String(formData.get('name') ?? '').trim();
  const slugInput = String(formData.get('slug') ?? '').trim();
  const planRaw = String(formData.get('plan') ?? 'starter').trim().toLowerCase();
  const plan = (PLANS.includes(planRaw as PlanId) ? planRaw : 'starter') as PlanId;
  const environment =
    String(formData.get('environment') ?? 'production').trim().toLowerCase() === 'staging'
      ? 'staging'
      : 'production';
  const ownerEmail = String(formData.get('ownerEmail') ?? '')
    .trim()
    .toLowerCase();
  const ownerName = String(formData.get('ownerName') ?? '').trim() || ownerEmail.split('@')[0] || 'Owner';
  if (!name) throw new Error('Company name is required.');
  if (!ownerEmail || !ownerEmail.includes('@')) throw new Error('Owner email is required.');

  const modules = modulesForPlan(plan);
  // Allow form overrides for modules
  for (const key of ['sales', 'purchase', 'inventory', 'pos', 'hr'] as const) {
    const v = formData.get(`module_${key}`);
    if (v !== null) modules[key] = v === 'on' || v === 'true' || v === '1';
  }

  const slug = await uniqueTenantSlug(slugInput || name);

  // Auth is Better Auth–managed; owner signs in with this email via the app login.
  const passwordHash = 'better-auth-managed';

  const tenantId = await db().transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name,
        slug,
        plan,
        environment,
        status: 'active',
        modules,
      })
      .returning({ id: tenants.id });

    if (!tenant) throw new Error('Could not create company.');

    await tx.insert(companyProfiles).values({
      tenantId: tenant.id,
      legalName: name,
      tradingName: name,
      country: 'Sri Lanka',
      baseCurrency: 'LKR',
      timezone: 'Asia/Colombo',
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

    const [existingUser] = await tx
      .select({ id: users.id, tenantId: users.tenantId })
      .from(users)
      .where(eq(users.email, ownerEmail))
      .limit(1);

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const [created] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: ownerEmail,
          name: ownerName,
          passwordHash,
          role: 'admin',
        })
        .returning({ id: users.id });
      if (!created) throw new Error('Could not create owner user.');
      userId = created.id;
    }

    const [existingMembership] = await tx
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, tenant.id),
          eq(tenantMemberships.userId, userId),
          isNull(tenantMemberships.voidedAt),
        ),
      )
      .limit(1);

    if (!existingMembership) {
      await tx.insert(tenantMemberships).values({
        tenantId: tenant.id,
        userId,
        role: 'owner',
        status: 'active',
      });
    }

    return tenant.id;
  });

  await writeAudit({
    actorUserId: actor.id,
    targetTenantId: tenantId,
    action: 'tenant.create',
    summary: `Created company ${name} (${slug})`,
    meta: { plan, environment, modules, ownerEmail },
  });

  revalidatePath('/control-room');
  revalidatePath('/control-room/companies');
  redirect(`/control-room/companies/${tenantId}`);
}

export async function updatePlatformCompanyFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Company id is required.');

  const name = String(formData.get('name') ?? '').trim();
  const planRaw = String(formData.get('plan') ?? 'starter').trim().toLowerCase();
  const plan = (PLANS.includes(planRaw as PlanId) ? planRaw : 'starter') as PlanId;
  const environment =
    String(formData.get('environment') ?? 'production').trim().toLowerCase() === 'staging'
      ? 'staging'
      : 'production';

  if (!name) throw new Error('Company name is required.');

  const modules = modulesForPlan(plan);
  for (const key of ['sales', 'purchase', 'inventory', 'pos', 'hr'] as const) {
    const v = formData.get(`module_${key}`);
    // Checkboxes: absent = false when form includes module_touch sentinel
    if (formData.get('module_touch') === '1') {
      modules[key] = v === 'on' || v === 'true' || v === '1';
    } else if (v !== null) {
      modules[key] = v === 'on' || v === 'true' || v === '1';
    }
  }

  const [before] = await db()
    .select({
      name: tenants.name,
      plan: tenants.plan,
      environment: tenants.environment,
      modules: tenants.modules,
    })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);

  if (!before) throw new Error('Company not found.');

  await db()
    .update(tenants)
    .set({
      name,
      plan,
      environment,
      modules,
      updatedAt: sql`NOW()`,
    })
    .where(eq(tenants.id, id));

  // Keep legal name in sync when profile exists
  await db()
    .update(companyProfiles)
    .set({ legalName: name, tradingName: name, updatedAt: sql`NOW()` })
    .where(and(eq(companyProfiles.tenantId, id), isNull(companyProfiles.voidedAt)));

  await writeAudit({
    actorUserId: actor.id,
    targetTenantId: id,
    action: 'tenant.update',
    summary: `Updated company ${name}`,
    meta: { before, after: { name, plan, environment, modules } },
  });

  revalidatePath('/control-room');
  revalidatePath('/control-room/companies');
  revalidatePath(`/control-room/companies/${id}`);
  revalidatePath('/control-room/modules');
}

export async function setPlatformCompanyStatusFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim().toLowerCase();
  if (!id) throw new Error('Company id is required.');
  if (status !== 'active' && status !== 'suspended') throw new Error('Invalid status.');

  // Prevent suspending your own home tenant by accident? allow but warn in UI.
  await db()
    .update(tenants)
    .set({
      status,
      voidedAt: status === 'suspended' ? sql`NOW()` : null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(tenants.id, id));

  const [t] = await db().select({ name: tenants.name }).from(tenants).where(eq(tenants.id, id)).limit(1);

  await writeAudit({
    actorUserId: actor.id,
    targetTenantId: id,
    action: status === 'suspended' ? 'tenant.suspend' : 'tenant.restore',
    summary: `${status === 'suspended' ? 'Suspended' : 'Restored'} ${t?.name ?? id}`,
  });

  revalidatePath('/control-room');
  revalidatePath('/control-room/companies');
  revalidatePath(`/control-room/companies/${id}`);
}

export async function listPlatformAudit(limit = 50): Promise<PlatformAuditRow[]> {
  await requirePlatformAdmin();

  const rows = await db()
    .select({
      id: platformAuditEvents.id,
      action: platformAuditEvents.action,
      summary: platformAuditEvents.summary,
      targetTenantId: platformAuditEvents.targetTenantId,
      createdAt: platformAuditEvents.createdAt,
      actorEmail: users.email,
      targetName: tenants.name,
    })
    .from(platformAuditEvents)
    .leftJoin(users, eq(users.id, platformAuditEvents.actorUserId))
    .leftJoin(tenants, eq(tenants.id, platformAuditEvents.targetTenantId))
    .orderBy(desc(platformAuditEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    summary: r.summary,
    targetTenantId: r.targetTenantId,
    targetName: r.targetName,
    actorEmail: r.actorEmail,
    createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
  }));
}

export async function listPlatformUsers(q?: string): Promise<PlatformUserRow[]> {
  await requirePlatformAdmin();

  const conditions = [isNull(users.voidedAt)];
  if (q?.trim()) {
    const term = `%${q.trim()}%`;
    conditions.push(or(ilike(users.email, term), ilike(users.name, term), ilike(tenants.name, term))!);
  }

  const rows = await db()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      tenantId: users.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(and(...conditions))
    .orderBy(desc(users.createdAt))
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    tenantId: r.tenantId,
    tenantName: r.tenantName,
    tenantSlug: r.tenantSlug,
    createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
  }));
}

export async function listModuleMatrix(): Promise<
  { id: string; name: string; plan: string; status: string; modules: TenantModules }[]
> {
  await requirePlatformAdmin();
  const rows = await db()
    .select({
      id: tenants.id,
      name: tenants.name,
      plan: tenants.plan,
      status: tenants.status,
      modules: tenants.modules,
    })
    .from(tenants)
    .orderBy(tenants.name)
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    plan: r.plan,
    status: r.status ?? 'active',
    modules: mapModules(r.modules, r.plan),
  }));
}

/** Apply plan defaults to a company modules (optional helper). */
export async function applyPlanModulesFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Company id is required.');

  const [row] = await db()
    .select({ plan: tenants.plan, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  if (!row) throw new Error('Company not found.');

  const modules = modulesForPlan(row.plan);
  await db()
    .update(tenants)
    .set({ modules, updatedAt: sql`NOW()` })
    .where(eq(tenants.id, id));

  await writeAudit({
    actorUserId: actor.id,
    targetTenantId: id,
    action: 'tenant.modules.reset',
    summary: `Reset modules to ${row.plan} defaults for ${row.name}`,
    meta: { modules },
  });

  revalidatePath(`/control-room/companies/${id}`);
  revalidatePath('/control-room/modules');
}

