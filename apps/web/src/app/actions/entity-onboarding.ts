'use server';

import { revalidatePath } from 'next/cache';
import { chartOfAccountsForEntity } from '@bookone/accounting';
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
            code: account.code,
            name: account.name,
            type: account.type,
            normalSide: account.normalSide,
          })),
        );
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

