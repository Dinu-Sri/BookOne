'use server';

import { randomUUID } from 'node:crypto';
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
  sql,
  tenantMemberships,
  tenants,
  users,
  platformAuditEvents,
  withTenantContext,
} from '@bookone/db';
import {
  modulesForPlan,
  modulesFromForm,
  normalizeModules,
  type TenantModules,
  type PlanId,
  PLANS,
} from '@/lib/platform-modules';

export type PlatformCompanyRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  environment: string;
  status: string;
  /** personal | sole_prop | company | pending */
  entityKind: string;
  /** lite | full | null */
  capabilityTier: string | null;
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
  /** Workspace entity kind of home tenant */
  entityKind: string;
  capabilityTier: string | null;
  tenantStatus: string;
  createdAt: string;
};

function isSuperAdmin(user: { role: string; email: string; platformRole?: string }) {
  return user.platformRole === 'super_admin' || user.role === 'super_admin';
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

function executeRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows: unknown[] }).rows;
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  }
  return [];
}

function textField(row: Record<string, unknown>, snake: string, camel: string): string {
  const value = row[snake] ?? row[camel];
  return value == null ? '' : String(value);
}

function optionalField(row: Record<string, unknown>, snake: string, camel: string): string | null {
  const value = row[snake] ?? row[camel];
  if (value == null || value === '') return null;
  return String(value);
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 't' || value === 'true' || value === 1 || value === '1';
}

const TENANT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseModules(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mapCatalogRow(row: Record<string, unknown>): PlatformCompanyRow {
  const plan = textField(row, 'plan', 'plan') || 'starter';
  const createdRaw = row.created_at ?? row.createdAt;
  return {
    id: textField(row, 'id', 'id'),
    name: textField(row, 'name', 'name'),
    slug: textField(row, 'slug', 'slug'),
    plan,
    environment: textField(row, 'environment', 'environment') || 'production',
    status: textField(row, 'status', 'status') || 'active',
    entityKind: textField(row, 'entity_kind', 'entityKind') || 'company',
    capabilityTier: optionalField(row, 'capability_tier', 'capabilityTier'),
    modules: mapModules(parseModules(row.modules), plan),
    createdAt:
      createdRaw instanceof Date
        ? createdRaw.toISOString()
        : createdRaw
          ? String(createdRaw)
          : new Date(0).toISOString(),
    userCount: Number(row.user_count ?? row.userCount ?? 0),
  };
}

async function loadAllCatalogRows(): Promise<PlatformCompanyRow[]> {
  const result = await db().execute(sql`
    SELECT id, name, slug, plan, environment, status, entity_kind, capability_tier, modules, created_at, user_count
    FROM public.bookone_platform_list_tenants()
  `);
  return executeRows(result).map(mapCatalogRow).filter((row) => row.id);
}

async function loadAllUserRows(): Promise<PlatformUserRow[]> {
  const result = await db().execute(sql`
    SELECT id, email, name, role, tenant_id, tenant_name, tenant_slug, entity_kind, capability_tier, tenant_status, created_at
    FROM public.bookone_platform_list_users()
  `);
  return executeRows(result)
    .map((row) => {
      const createdRaw = row.created_at ?? row.createdAt;
      return {
        id: textField(row, 'id', 'id'),
        email: textField(row, 'email', 'email'),
        name: textField(row, 'name', 'name'),
        role: textField(row, 'role', 'role'),
        tenantId: textField(row, 'tenant_id', 'tenantId'),
        tenantName: textField(row, 'tenant_name', 'tenantName'),
        tenantSlug: textField(row, 'tenant_slug', 'tenantSlug'),
        entityKind: textField(row, 'entity_kind', 'entityKind') || 'company',
        capabilityTier: optionalField(row, 'capability_tier', 'capabilityTier'),
        tenantStatus: textField(row, 'tenant_status', 'tenantStatus') || 'active',
        createdAt:
          createdRaw instanceof Date
            ? createdRaw.toISOString()
            : createdRaw
              ? String(createdRaw)
              : new Date(0).toISOString(),
      };
    })
    .filter((row) => row.id);
}

async function lookupUserIdByEmail(email: string): Promise<string | null> {
  const result = await db().execute(sql`
    SELECT id FROM public.bookone_lookup_user_by_email(${email})
  `);
  const id = textField(executeRows(result)[0] ?? {}, 'id', 'id');
  return id || null;
}

async function uniqueTenantSlug(base: string): Promise<string> {
  const safeBase = slugify(base) || 'company';
  for (let i = 0; i < 30; i += 1) {
    const candidate = i === 0 ? safeBase : `${safeBase}-${i + 1}`;
    const result = await db().execute(sql`
      SELECT public.bookone_platform_slug_exists(${candidate}) AS taken
    `);
    const taken = isTruthyFlag(executeRows(result)[0]?.taken);
    if (!taken) return candidate;
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
  entityKind?: string;
}): Promise<PlatformCompanyRow[]> {
  let rows = await loadAllCatalogRows();
  if (filter?.status && filter.status !== 'all') {
    rows = rows.filter((row) => row.status === filter.status);
  }
  if (filter?.plan && filter.plan !== 'all') {
    rows = rows.filter((row) => row.plan === filter.plan);
  }
  if (filter?.environment && filter.environment !== 'all') {
    rows = rows.filter((row) => row.environment === filter.environment);
  }
  if (filter?.entityKind && filter.entityKind !== 'all') {
    rows = rows.filter((row) => row.entityKind === filter.entityKind);
  }
  if (filter?.q?.trim()) {
    const q = filter.q.trim().toLowerCase();
    rows = rows.filter((row) => row.name.toLowerCase().includes(q) || row.slug.toLowerCase().includes(q));
  }
  return rows.slice(0, 200);
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  await requirePlatformAdmin();

  const catalog = await loadAllCatalogRows();
  const stats = {
    total: catalog.length,
    active: catalog.filter((row) => row.status === 'active').length,
    suspended: catalog.filter((row) => row.status === 'suspended').length,
    staging: catalog.filter((row) => row.environment === 'staging').length,
    production: catalog.filter((row) => row.environment === 'production').length,
  };

  const recent = catalog.slice(0, 200);
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
  entityKind?: string;
}): Promise<PlatformCompanyRow[]> {
  await requirePlatformAdmin();
  return loadCompanyRows(filter);
}

export async function getPlatformCompany(id: string): Promise<PlatformCompanyDetail | null> {
  await requirePlatformAdmin();
  if (!TENANT_UUID.test(id)) return null;

  return withTenantContext(id, async () => {
    const [row] = await db()
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        plan: tenants.plan,
        environment: tenants.environment,
        status: tenants.status,
        entityKind: tenants.entityKind,
        capabilityTier: tenants.capabilityTier,
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
      entityKind: row.entityKind ?? 'company',
      capabilityTier: row.capabilityTier ?? null,
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
  });
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

  const modules = modulesFromForm(formData, plan);

  const slug = await uniqueTenantSlug(slugInput || name);

  // Auth is Better Auth–managed; owner signs in with this email via the app login.
  const passwordHash = 'better-auth-managed';
  const tenantId = randomUUID();
  const existingUserId = await lookupUserIdByEmail(ownerEmail);

  await withTenantContext(tenantId, async () => {
    await db().transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          id: tenantId,
          name,
          slug,
          plan,
          environment,
          status: 'active',
          modules,
          entityKind: 'company',
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

      let userId = existingUserId;
      if (!userId) {
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
    });
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

  const modules = modulesFromForm(formData, plan);

  const before = await withTenantContext(id, async () => {
    const [existing] = await db()
      .select({
        name: tenants.name,
        plan: tenants.plan,
        environment: tenants.environment,
        modules: tenants.modules,
      })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);

    if (!existing) throw new Error('Company not found.');

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

    await db()
      .update(companyProfiles)
      .set({ legalName: name, tradingName: name, updatedAt: sql`NOW()` })
      .where(and(eq(companyProfiles.tenantId, id), isNull(companyProfiles.voidedAt)));

    return existing;
  });

  await writeAudit({
    actorUserId: actor.id,
    targetTenantId: id,
    action: 'tenant.update',
    summary: `Updated company ${name}`,
    meta: { before, after: { name, plan, environment, modules } },
  });

  revalidatePath('/control-room');
  revalidatePath('/control-room/companies');
  revalidatePath('/control-room/modules');
}

export async function setPlatformCompanyStatusFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get('id') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim().toLowerCase();
  if (!id) throw new Error('Company id is required.');
  if (status !== 'active' && status !== 'suspended') throw new Error('Invalid status.');

  const t = await withTenantContext(id, async () => {
    await db()
      .update(tenants)
      .set({
        status,
        voidedAt: status === 'suspended' ? sql`NOW()` : null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(tenants.id, id));

    const [row] = await db().select({ name: tenants.name }).from(tenants).where(eq(tenants.id, id)).limit(1);
    return row;
  });

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
      actorUserId: platformAuditEvents.actorUserId,
    })
    .from(platformAuditEvents)
    .orderBy(desc(platformAuditEvents.createdAt))
    .limit(limit);

  const tenantsById = new Map((await loadAllCatalogRows()).map((row) => [row.id, row]));
  const usersById = new Map((await loadAllUserRows()).map((row) => [row.id, row]));

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    summary: r.summary,
    targetTenantId: r.targetTenantId,
    targetName: r.targetTenantId ? tenantsById.get(r.targetTenantId)?.name ?? null : null,
    actorEmail: usersById.get(r.actorUserId)?.email ?? null,
    createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
  }));
}

export async function listPlatformUsers(q?: string): Promise<PlatformUserRow[]> {
  await requirePlatformAdmin();
  let rows = await loadAllUserRows();
  if (q?.trim()) {
    const term = q.trim().toLowerCase();
    rows = rows.filter(
      (row) =>
        row.email.toLowerCase().includes(term) ||
        row.name.toLowerCase().includes(term) ||
        row.tenantName.toLowerCase().includes(term),
    );
  }
  return rows.slice(0, 100);
}

export async function listModuleMatrix(): Promise<
  { id: string; name: string; plan: string; status: string; modules: TenantModules }[]
> {
  await requirePlatformAdmin();
  return (await loadAllCatalogRows())
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 200)
    .map((row) => ({
      id: row.id,
      name: row.name,
      plan: row.plan,
      status: row.status,
      modules: row.modules,
    }));
}

/**
 * Admin: set entity kind + capability (personal / sole lite|full / company).
 * Downgrade sole full → lite keeps inventory/pos visible as read-only history.
 */
export async function adminSetTenantEntityTierFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Workspace id is required.');

  const kindRaw = String(formData.get('entityKind') ?? 'company').trim().toLowerCase();
  const entityKind =
    kindRaw === 'personal' || kindRaw === 'sole_prop' || kindRaw === 'company' || kindRaw === 'pending'
      ? kindRaw
      : 'company';
  const tierRaw = String(formData.get('capabilityTier') ?? 'lite').trim().toLowerCase();
  const capabilityTier =
    entityKind === 'sole_prop' ? (tierRaw === 'full' ? 'full' : 'lite') : entityKind === 'company' ? null : null;

  const { modulesForEntityKind, parseEntityKind } = await import('@/lib/entity-kind');
  const { chartOfAccountsForEntity } = await import('@bookone/accounting');
  const { accounts } = await import('@bookone/db');

  const { before, modules, nextTier, preserveAdvancedView } = await withTenantContext(id, async () => {
    const [existing] = await db()
      .select({
        name: tenants.name,
        entityKind: tenants.entityKind,
        capabilityTier: tenants.capabilityTier,
        modules: tenants.modules,
      })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    if (!existing) throw new Error('Workspace not found.');

    const prevKind = parseEntityKind(existing.entityKind);
    const prevTier = String(existing.capabilityTier ?? 'lite').toLowerCase() === 'full' ? 'full' : 'lite';
    const nextTierInner = capabilityTier === 'full' ? 'full' : 'lite';

    const preserveAdvanced =
      entityKind === 'sole_prop' &&
      nextTierInner === 'lite' &&
      (prevKind === 'sole_prop' && prevTier === 'full'
        ? true
        : Boolean((existing.modules as { inventory?: boolean; pos?: boolean } | null)?.inventory) ||
          Boolean((existing.modules as { inventory?: boolean; pos?: boolean } | null)?.pos));

    const nextModules =
      entityKind === 'personal' || entityKind === 'pending'
        ? modulesForEntityKind(entityKind)
        : entityKind === 'sole_prop'
          ? modulesForEntityKind('sole_prop', nextTierInner, { preserveAdvancedView: preserveAdvanced })
          : normalizeModules(existing.modules, 'starter');

    await db()
      .update(tenants)
      .set({
        entityKind,
        capabilityTier: entityKind === 'sole_prop' ? nextTierInner : null,
        modules: nextModules,
        updatedAt: sql`NOW()`,
      })
      .where(eq(tenants.id, id));

    if (entityKind !== 'pending') {
      const pack = chartOfAccountsForEntity(entityKind);
      const existingAccounts = await db()
        .select({ code: accounts.code })
        .from(accounts)
        .where(eq(accounts.tenantId, id));
      const have = new Set(existingAccounts.map((a) => a.code));
      const missing = pack.filter((a) => !have.has(a.code));
      if (missing.length) {
        await db().insert(accounts).values(
          missing.map((account) => ({
            tenantId: id,
            code: account.code,
            name: account.name,
            type: account.type,
            normalSide: account.normalSide,
          })),
        );
      }
    }

    return {
      before: existing,
      modules: nextModules,
      nextTier: nextTierInner,
      preserveAdvancedView: preserveAdvanced,
    };
  });

  await writeAudit({
    actorUserId: actor.id,
    targetTenantId: id,
    action: 'tenant.entity_tier',
    summary: `Set ${before.name} → ${entityKind}${entityKind === 'sole_prop' ? `/${nextTier}` : ''}`,
    meta: {
      before: {
        entityKind: before.entityKind,
        capabilityTier: before.capabilityTier,
        modules: before.modules,
      },
      after: { entityKind, capabilityTier: entityKind === 'sole_prop' ? nextTier : null, modules },
      preserveAdvancedView,
    },
  });

  revalidatePath('/control-room');
  revalidatePath('/control-room/companies');
  revalidatePath(`/control-room/companies/${id}`);
  revalidatePath('/');
  revalidatePath('/cashbook');
}

/** Apply plan defaults to a company modules (optional helper). */
export async function applyPlanModulesFromForm(formData: FormData): Promise<void> {
  const actor = await requirePlatformAdmin();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Company id is required.');

  const { row, modules } = await withTenantContext(id, async () => {
    const [existing] = await db()
      .select({ plan: tenants.plan, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    if (!existing) throw new Error('Company not found.');

    const nextModules = modulesForPlan(existing.plan);
    await db()
      .update(tenants)
      .set({ modules: nextModules, updatedAt: sql`NOW()` })
      .where(eq(tenants.id, id));
    return { row: existing, modules: nextModules };
  });

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

