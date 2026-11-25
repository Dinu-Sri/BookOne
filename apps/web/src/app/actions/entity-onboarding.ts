'use server';

import { revalidatePath } from 'next/cache';
import { chartOfAccountsForEntity, classifiedSeedValues, coaRenamesForEntity } from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  and,
  companyProfiles,
  db,
  eq,
  isNull,
  sql,
  tenants,
  withTenantContext,
} from '@bookone/db';
import {
  displayNameForEntity,
  modulesForEntityKind,
  parseEntityKind,
  type CapabilityTier,
  type EntityKind,
} from '@/lib/entity-kind';

export type CompleteOnboardingResult = { ok: true; homePath: string } | { ok: false; error: string };

/**
 * Apply registration tile choice: entity kind, modules, CoA pack, display name.
 */
export async function completeEntityOnboarding(input: {
  entityKind: 'personal' | 'sole_prop' | 'company';
  capabilityTier?: CapabilityTier;
  displayName?: string;
}): Promise<CompleteOnboardingResult> {
  try {
    const user = await requireTenantContext();
    const entityKind = parseEntityKind(input.entityKind) as EntityKind;
    if (entityKind === 'pending') {
      return { ok: false, error: 'Choose Personal, Sole prop, or Company.' };
    }
    const capability: CapabilityTier =
      entityKind === 'sole_prop' ? input.capabilityTier ?? 'lite' : 'full';
    const modules = modulesForEntityKind(entityKind, capability);
    const name =
      input.displayName?.trim() ||
      displayNameForEntity(entityKind, user.name || user.email.split('@')[0] || 'My');

    await withTenantContext(user.tenantId, async () => {
      await db()
        .update(tenants)
        .set({
          entityKind,
          capabilityTier: entityKind === 'sole_prop' ? capability : null,
          modules,
          name,
          updatedAt: sql`NOW()`,
        })
        .where(eq(tenants.id, user.tenantId));

      // Ensure company profile row for company/sole (personal can soft-create later)
      if (entityKind !== 'personal') {
        const [existing] = await db()
          .select({ id: companyProfiles.id })
          .from(companyProfiles)
          .where(
            and(eq(companyProfiles.tenantId, user.tenantId), isNull(companyProfiles.voidedAt)),
          )
          .limit(1);
        if (!existing) {
          await db().insert(companyProfiles).values({
            tenantId: user.tenantId,
            legalName: name,
          });
        }
      }

      // Merge any missing CoA accounts for the pack (never delete)
      const pack = chartOfAccountsForEntity(entityKind);
      const existing = await db()
        .select({ code: accounts.code })
        .from(accounts)
        .where(eq(accounts.tenantId, user.tenantId));
      const have = new Set(existing.map((a) => a.code));
      const missing = pack.filter((a) => !have.has(a.code));
      if (missing.length) {
        await db().insert(accounts).values(
          missing.map((account) => ({
            tenantId: user.tenantId,
            ...classifiedSeedValues(account),
          })),
        );
      }

      // Sign-up seeds the personal pack, so shared codes still carry personal
      // names (6500 "Healthcare" instead of "Office Supplies Expense").
      // Rename only untouched, unposted accounts.
      const current = await db()
        .select({
          id: accounts.id,
          code: accounts.code,
          name: accounts.name,
          hasPostings: sql<boolean>`EXISTS (SELECT 1 FROM journal_lines jl WHERE jl.account_id = ${accounts.id})`,
        })
        .from(accounts)
        .where(eq(accounts.tenantId, user.tenantId));
      const idByCode = new Map(current.map((a) => [a.code, a.id]));
      for (const rename of coaRenamesForEntity(entityKind, current)) {
        const id = idByCode.get(rename.code);
        if (!id) continue;
        await db()
          .update(accounts)
          .set({ name: rename.to, updatedAt: sql`NOW()` })
          .where(and(eq(accounts.id, id), eq(accounts.name, rename.from)));
      }
    });

    revalidatePath('/');
    revalidatePath('/cashbook');
    revalidatePath('/onboarding');

    if (entityKind === 'personal' || entityKind === 'sole_prop') {
      return { ok: true, homePath: '/cashbook' };
    }
    return { ok: true, homePath: '/' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onboarding failed' };
  }
}

