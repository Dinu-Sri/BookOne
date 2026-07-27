'use server';

import { revalidatePath } from 'next/cache';
import { chartOfAccountsForEntity } from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  and,
  auditLog,
  brands,
  companyProfiles,
  db,
  eq,
  isNull,
  journalEntries,
  journalLines,
  locations,
  sql,
  tenantMemberships,
  tenants,
  transactions,
  users,
  withTenantContext,
} from '@bookone/db';
import {
  canAccessFullErp,
  displayNameForEntity,
  modulesForEntityKind,
  parseEntityKind,
  type CapabilityTier,
  type EntityKind,
} from '@/lib/entity-kind';

export type LifecycleResult =
  | { ok: true; homePath: string; message: string }
  | { ok: false; error: string };

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

async function mergeCoaForEntity(tenantId: string, entityKind: EntityKind) {
  const pack = chartOfAccountsForEntity(entityKind);
  const existing = await db()
    .select({ code: accounts.code })
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId));
  const have = new Set(existing.map((a) => a.code));
  const missing = pack.filter((a) => !have.has(a.code));
  if (missing.length) {
    await db().insert(accounts).values(
      missing.map((account) => ({
        tenantId,
        code: account.code,
        name: account.name,
        type: account.type,
        normalSide: account.normalSide,
      })),
    );
  }
}

async function ensureCompanyProfile(tenantId: string, legalName: string) {
  const [existing] = await db()
    .select({ id: companyProfiles.id })
    .from(companyProfiles)
    .where(and(eq(companyProfiles.tenantId, tenantId), isNull(companyProfiles.voidedAt)))
    .limit(1);
  if (!existing) {
    await db().insert(companyProfiles).values({
      tenantId,
      legalName,
    });
  }
}

async function writeAudit(
  tenantId: string,
  userId: string,
  action: string,
  recordId: string,
  newValues: Record<string, unknown>,
  notes: string,
) {
  await db().insert(auditLog).values({
    tenantId,
    userId,
    action,
    tableName: 'tenants',
    recordId,
    newValues,
    notes,
  });
}

/**
 * personal → sole_prop (lite). Same tenant; history kept; business CoA merged.
 */
export async function upgradePersonalToSoleLite(input?: {
  displayName?: string;
}): Promise<LifecycleResult> {
  try {
    const user = await requireTenantContext();
    const [t] = await db()
      .select({
        id: tenants.id,
        name: tenants.name,
        entityKind: tenants.entityKind,
      })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);
    if (!t) return { ok: false, error: 'Workspace not found.' };

    const kind = parseEntityKind(t.entityKind);
    if (kind !== 'personal') {
      return { ok: false, error: 'Only personal workspaces can upgrade to sole prop lite.' };
    }

    const name =
      input?.displayName?.trim() ||
      displayNameForEntity('sole_prop', user.name || user.email.split('@')[0] || 'My');
    const modules = modulesForEntityKind('sole_prop', 'lite');

    await withTenantContext(user.tenantId, async () => {
      await db()
        .update(tenants)
        .set({
          entityKind: 'sole_prop',
          capabilityTier: 'lite',
          modules,
          name,
          updatedAt: sql`NOW()`,
        })
        .where(eq(tenants.id, user.tenantId));

      await ensureCompanyProfile(user.tenantId, name);
      await mergeCoaForEntity(user.tenantId, 'sole_prop');
      await writeAudit(
        user.tenantId,
        user.id,
        'UPGRADE',
        user.tenantId,
        { from: 'personal', to: 'sole_prop', capabilityTier: 'lite' },
        'Lifecycle: personal → sole_prop lite',
      );
    });

    revalidatePath('/');
    revalidatePath('/cashbook');
    revalidatePath('/cashbook/settings');
    return {
      ok: true,
      homePath: '/cashbook',
      message: 'Upgraded to sole prop (lite). Use Personal | Business domain tiles.',
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Upgrade failed' };
  }
}

/**
 * sole lite → sole full. Modules expand; history kept; full ERP unlocks.
 */
export async function upgradeSoleLiteToFull(): Promise<LifecycleResult> {
  try {
    const user = await requireTenantContext();
    const [t] = await db()
      .select({
        id: tenants.id,
        entityKind: tenants.entityKind,
        capabilityTier: tenants.capabilityTier,
      })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);
    if (!t) return { ok: false, error: 'Workspace not found.' };

    const kind = parseEntityKind(t.entityKind);
    if (kind !== 'sole_prop') {
      return { ok: false, error: 'Only sole prop workspaces can expand to full modules.' };
    }
    if (canAccessFullErp(kind, t.capabilityTier)) {
      return { ok: false, error: 'Already on sole prop full.' };
    }

    const modules = modulesForEntityKind('sole_prop', 'full');

    await withTenantContext(user.tenantId, async () => {
      await db()
        .update(tenants)
        .set({
          capabilityTier: 'full',
          modules,
          updatedAt: sql`NOW()`,
        })
        .where(eq(tenants.id, user.tenantId));

      await mergeCoaForEntity(user.tenantId, 'sole_prop');
      await writeAudit(
        user.tenantId,
        user.id,
        'UPGRADE',
        user.tenantId,
        { from: 'lite', to: 'full', modules },
        'Lifecycle: sole_prop lite → full (modules expanded)',
      );
    });

    revalidatePath('/');
    revalidatePath('/cashbook');
    revalidatePath('/cashbook/settings');
    return {
      ok: true,
      homePath: '/',
      message: 'Full business modules on. Cashbook still available; open full BookOne for stock/POS.',
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Upgrade failed' };
  }
}

/**
 * sole full → lite. capability write-locked; inventory/POS stay visible as read-only.
 * Journals and stock history are never deleted.
 */
export async function downgradeSoleFullToLite(): Promise<LifecycleResult> {
  try {
    const user = await requireTenantContext();
    const [t] = await db()
      .select({
        id: tenants.id,
        entityKind: tenants.entityKind,
        capabilityTier: tenants.capabilityTier,
      })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);
    if (!t) return { ok: false, error: 'Workspace not found.' };

    const kind = parseEntityKind(t.entityKind);
    if (kind !== 'sole_prop' || !canAccessFullErp(kind, t.capabilityTier)) {
      return { ok: false, error: 'Only sole prop full can downgrade to lite.' };
    }

    // Keep inventory/pos flags so history remains navigable (read-only via capability).
    const modules = modulesForEntityKind('sole_prop', 'lite', { preserveAdvancedView: true });

    await withTenantContext(user.tenantId, async () => {
      await db()
        .update(tenants)
        .set({
          capabilityTier: 'lite',
          modules,
          updatedAt: sql`NOW()`,
        })
        .where(eq(tenants.id, user.tenantId));

      await writeAudit(
        user.tenantId,
        user.id,
        'DOWNGRADE',
        user.tenantId,
        { from: 'full', to: 'lite', modules, advancedViewOnly: true },
        'Lifecycle: sole_prop full → lite (writes off; history viewable)',
      );
    });

    revalidatePath('/');
    revalidatePath('/cashbook');
    revalidatePath('/cashbook/settings');
    return {
      ok: true,
      homePath: '/cashbook',
      message:
        'Back to sole lite. Inventory/POS stay visible as read-only. Upgrade again to create or edit.',
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Downgrade failed' };
  }
}

type AccountBalance = {
  code: string;
  name: string;
  type: string;
  normalSide: string;
  /** Positive = balance on normal side */
  balance: number;
};

/**
 * Net balances for sole business-domain journals (for company opening balances).
 */
async function businessDomainBalances(tenantId: string): Promise<AccountBalance[]> {
  return withTenantContext(tenantId, async () => {
    const rows = await db()
      .select({
        code: accounts.code,
        name: accounts.name,
        type: accounts.type,
        normalSide: accounts.normalSide,
        side: journalLines.side,
        amount: journalLines.amount,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(
        and(
          eq(journalEntries.tenantId, tenantId),
          eq(journalEntries.bookDomain, 'business'),
          isNull(journalEntries.voidedAt),
          isNull(journalLines.voidedAt),
        ),
      );

    const map = new Map<string, AccountBalance & { debit: number; credit: number }>();
    for (const r of rows) {
      let cur = map.get(r.code);
      if (!cur) {
        cur = {
          code: r.code,
          name: r.name,
          type: r.type,
          normalSide: r.normalSide,
          balance: 0,
          debit: 0,
          credit: 0,
        };
        map.set(r.code, cur);
      }
      const amt = Number(r.amount);
      if (r.side === 'debit') cur.debit += amt;
      else cur.credit += amt;
    }

    const out: AccountBalance[] = [];
    for (const cur of map.values()) {
      const raw = cur.debit - cur.credit;
      // Convert to normal-side signed balance (assets debit-positive, etc.)
      const balance = cur.normalSide === 'debit' ? raw : -raw;
      if (Math.abs(balance) < 0.005) continue;
      out.push({
        code: cur.code,
        name: cur.name,
        type: cur.type,
        normalSide: cur.normalSide,
        balance: Math.round(balance * 100) / 100,
      });
    }
    return out;
  });
}

/**
 * sole → company: NEW company tenant; opening balances from business domain;
 * sole workspace archived (tax history kept); user switched to company.
 */
export async function incorporateSoleToCompany(input?: {
  companyName?: string;
}): Promise<LifecycleResult> {
  try {
    const user = await requireTenantContext();
    const soleTenantId = user.tenantId;

    const [sole] = await db()
      .select({
        id: tenants.id,
        name: tenants.name,
        entityKind: tenants.entityKind,
        status: tenants.status,
      })
      .from(tenants)
      .where(eq(tenants.id, soleTenantId))
      .limit(1);

    if (!sole) return { ok: false, error: 'Workspace not found.' };
    const kind = parseEntityKind(sole.entityKind);
    if (kind !== 'sole_prop') {
      return { ok: false, error: 'Only sole prop workspaces can incorporate to a company.' };
    }
    if (sole.status === 'archived') {
      return { ok: false, error: 'This workspace is already archived.' };
    }

    const companyName =
      input?.companyName?.trim() ||
      `${sole.name.replace(/'s Business$/i, '').trim() || 'My'} Pvt Ltd`;
    const slug = await uniqueTenantSlug(companyName);
    const modules = modulesForEntityKind('company', 'full');
    const coa = chartOfAccountsForEntity('company');
    const today = new Date().toISOString().slice(0, 10);

    // Capture business balances while still on sole tenant context
    const balances = await businessDomainBalances(soleTenantId);

    // Create company tenant + seed outside sole RLS if needed — use super-style inserts
    // withTenantContext for each tenant
    const newTenantId = await db().transaction(async (tx) => {
      const [company] = await tx
        .insert(tenants)
        .values({
          name: companyName,
          slug,
          plan: 'starter',
          entityKind: 'company',
          capabilityTier: null,
          modules,
          status: 'active',
        })
        .returning({ id: tenants.id });
      if (!company) throw new Error('Could not create company workspace.');

      await tx.insert(tenantMemberships).values({
        tenantId: company.id,
        userId: user.id,
        role: 'owner',
        status: 'active',
      });

      await tx
        .update(users)
        .set({ tenantId: company.id })
        .where(eq(users.id, user.id));

      // Archive sole — history retained
      await tx
        .update(tenants)
        .set({
          status: 'archived',
          updatedAt: sql`NOW()`,
        })
        .where(eq(tenants.id, soleTenantId));

      return company.id;
    });

    // Seed company books under new tenant RLS
    await withTenantContext(newTenantId, async () => {
      await db().insert(accounts).values(
        coa.map((account) => ({
          tenantId: newTenantId,
          code: account.code,
          name: account.name,
          type: account.type,
          normalSide: account.normalSide,
        })),
      );

      await db().insert(companyProfiles).values({
        tenantId: newTenantId,
        legalName: companyName,
      });

      const [brand] = await db()
        .insert(brands)
        .values({
          tenantId: newTenantId,
          name: 'Main brand',
          code: 'MAIN',
          status: 'active',
        })
        .returning({ id: brands.id });

      await db().insert(locations).values({
        tenantId: newTenantId,
        brandId: brand?.id ?? null,
        name: 'Head office',
        code: 'HO',
        status: 'active',
      });

      // Map company account codes → ids
      const companyAccounts = await db()
        .select({ id: accounts.id, code: accounts.code, normalSide: accounts.normalSide })
        .from(accounts)
        .where(eq(accounts.tenantId, newTenantId));
      const byCode = new Map(companyAccounts.map((a) => [a.code, a]));
      const bank = byCode.get('1100') ?? byCode.get('1000');
      if (!bank) throw new Error('Company CoA missing cash/bank accounts.');

      // Opening balance lines from sole business domain (matching company CoA codes)
      const openLines: { accountId: string; side: 'debit' | 'credit'; amount: number; memo: string }[] =
        [];

      for (const b of balances) {
        const acc = byCode.get(b.code);
        if (!acc) continue;
        // Equity accounts are re-established via plug line below
        if (b.code === '3000' || b.code === '3100') continue;

        if (b.balance > 0) {
          openLines.push({
            accountId: acc.id,
            side: acc.normalSide as 'debit' | 'credit',
            amount: b.balance,
            memo: `Opening from sole business (${b.code})`,
          });
        } else if (b.balance < 0) {
          openLines.push({
            accountId: acc.id,
            side: acc.normalSide === 'debit' ? 'credit' : 'debit',
            amount: Math.abs(b.balance),
            memo: `Opening from sole business (${b.code})`,
          });
        }
      }

      // Balance the opening journal into Owner Equity 3000
      const equity = byCode.get('3000');
      if (equity && openLines.length > 0) {
        let debitSum = 0;
        let creditSum = 0;
        for (const l of openLines) {
          if (l.side === 'debit') debitSum += l.amount;
          else creditSum += l.amount;
        }
        const diff = Math.round((debitSum - creditSum) * 100) / 100;
        if (Math.abs(diff) >= 0.005) {
          if (diff > 0) {
            openLines.push({
              accountId: equity.id,
              side: 'credit',
              amount: diff,
              memo: 'Opening equity (incorporation)',
            });
          } else {
            openLines.push({
              accountId: equity.id,
              side: 'debit',
              amount: Math.abs(diff),
              memo: 'Opening equity adjustment (incorporation)',
            });
          }
        }
      }

      if (openLines.length > 0) {
        const [txn] = await db()
          .insert(transactions)
          .values({
            tenantId: newTenantId,
            userId: user.id,
            accountingType: 'Owner',
            direction: 'money_in',
            party: sole.name,
            description: 'Opening balances from sole prop business books (incorporation)',
            amount: String(
              openLines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0),
            ),
            currency: 'LKR',
            paymentMethod: 'Bank',
            paymentAccountId: bank.id,
            bookDomain: 'business',
            date: today,
            isAlreadySettled: '1',
            notes: `Source sole tenant ${soleTenantId}`,
          })
          .returning({ id: transactions.id });

        const [je] = await db()
          .insert(journalEntries)
          .values({
            tenantId: newTenantId,
            userId: user.id,
            transactionId: txn!.id,
            bookDomain: 'business',
            memo: 'Opening balances (incorporation from sole prop)',
            entryDate: today,
            isBalanced: '1',
            notes: `Archived sole: ${soleTenantId}`,
          })
          .returning({ id: journalEntries.id });

        for (const line of openLines) {
          await db().insert(journalLines).values({
            tenantId: newTenantId,
            journalEntryId: je!.id,
            accountId: line.accountId,
            side: line.side,
            amount: line.amount.toFixed(2),
            memo: line.memo,
          });
        }
      }

      await writeAudit(
        newTenantId,
        user.id,
        'INCORPORATE',
        newTenantId,
        {
          fromTenantId: soleTenantId,
          fromEntity: 'sole_prop',
          toEntity: 'company',
          openingLineCount: openLines.length,
          balanceAccounts: balances.map((b) => b.code),
        },
        'Lifecycle: sole prop incorporated to new company tenant',
      );
    });

    // Audit on archived sole
    await withTenantContext(soleTenantId, async () => {
      await writeAudit(
        soleTenantId,
        user.id,
        'ARCHIVE',
        soleTenantId,
        { status: 'archived', successorTenantId: newTenantId },
        'Lifecycle: sole archived after incorporation',
      );
    });

    revalidatePath('/');
    revalidatePath('/cashbook');
    revalidatePath('/cashbook/settings');
    return {
      ok: true,
      homePath: '/',
      message: `Company “${companyName}” created. Sole books archived for tax history. Opening balances posted from business domain.`,
    };
  } catch (e) {
    console.error('incorporateSoleToCompany failed', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Incorporation failed' };
  }
}

export async function getLifecycleOptions(): Promise<{
  entityKind: EntityKind;
  capabilityTier: CapabilityTier | null;
  canUpgradeToSole: boolean;
  canUpgradeToFull: boolean;
  canDowngradeToLite: boolean;
  canIncorporate: boolean;
  showFullErp: boolean;
  tenantName: string;
  tenantStatus: string;
}> {
  const user = await requireTenantContext();
  const [t] = await db()
    .select({
      name: tenants.name,
      entityKind: tenants.entityKind,
      capabilityTier: tenants.capabilityTier,
      status: tenants.status,
    })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);

  const entityKind = parseEntityKind(t?.entityKind);
  const capabilityTier =
    t?.capabilityTier === 'full' || t?.capabilityTier === 'lite'
      ? (t.capabilityTier as CapabilityTier)
      : entityKind === 'sole_prop'
        ? 'lite'
        : null;
  const showFullErp = canAccessFullErp(entityKind, t?.capabilityTier);

  return {
    entityKind,
    capabilityTier,
    canUpgradeToSole: entityKind === 'personal',
    canUpgradeToFull: entityKind === 'sole_prop' && !showFullErp,
    canDowngradeToLite: entityKind === 'sole_prop' && showFullErp,
    canIncorporate: entityKind === 'sole_prop' && t?.status !== 'archived',
    showFullErp,
    tenantName: t?.name ?? 'Workspace',
    tenantStatus: t?.status ?? 'active',
  };
}
