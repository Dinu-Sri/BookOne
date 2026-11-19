'use server';

import { revalidatePath } from 'next/cache';
import { classifiedSeedValues, isLiquidTenderCode, nextSuggestedCode } from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  and,
  db,
  eq,
  isNull,
  asc,
  sql,
  tenants,
  withTenantContext,
} from '@bookone/db';
import { assertPermission } from '@/lib/access';
import { parseEntityKind, usesPersonalShell } from '@/lib/entity-kind';

export type LiquidAccount = {
  id: string;
  code: string;
  name: string;
  /** Short label for tiles (name, trimmed) */
  shortName: string;
  kind: 'cash' | 'bank' | 'card';
};

function classify(code: string): 'cash' | 'bank' | 'card' {
  if (/^10\d{2}$/.test(code)) return 'cash';
  if (/^12\d{2}$/.test(code)) return 'card';
  return 'bank';
}

async function assertBankWrite(): Promise<void> {
  const user = await requireTenantContext();
  const [row] = await withTenantContext(user.tenantId, async () =>
    db()
      .select({ entityKind: tenants.entityKind })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1),
  );
  const personal = usesPersonalShell(parseEntityKind(row?.entityKind));
  await assertPermission(personal ? 'accounting.cashbook.write' : 'accounting.accounts.write', 'write');
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === 'object'; i += 1) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Cash + bank (and card) liquid accounts for payment / move tiles. */
export async function listLiquidAccounts(): Promise<LiquidAccount[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: accounts.id,
        code: accounts.code,
        name: accounts.name,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.tenantId, user.tenantId),
          isNull(accounts.voidedAt),
          eq(accounts.isActive, '1'),
          eq(accounts.type, 'asset'),
        ),
      )
      .orderBy(asc(accounts.code));

    return rows
      .filter((r) => isLiquidTenderCode(r.code))
      .map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        // Keep "Bank" for default 1100 so pay tiles stay clear (not stripped to "Account")
        shortName:
          r.code === '1100'
            ? 'Bank'
            : r.name.replace(/^Bank\s*[·\-–:]?\s*/i, '').trim() || r.name,
        kind: classify(r.code),
      }));
  });
}

/**
 * Add a bank account with a short display name (e.g. "HNB", "BOC Savings").
 * Codes allocated in 1101–1199 (1100 = default Bank Account).
 */
export async function createCashbookBank(shortName: string): Promise<
  { ok: true; account: LiquidAccount } | { ok: false; error: string }
> {
  try {
    const name = shortName.trim().slice(0, 40);
    if (!name) return { ok: false, error: 'Enter a short bank name.' };
    if (name.length < 2) return { ok: false, error: 'Name is too short.' };

    await assertBankWrite();
    const user = await requireTenantContext();
    const account = await withTenantContext(user.tenantId, async () => {
      const existing = await db()
        .select({ code: accounts.code, name: accounts.name, isActive: accounts.isActive, voidedAt: accounts.voidedAt })
        .from(accounts)
        .where(eq(accounts.tenantId, user.tenantId));

      const nextCode = nextSuggestedCode({ from: 1101, to: 1199 }, existing.map((e) => e.code));
      if (!nextCode) {
        throw new Error('Maximum number of bank accounts reached (1101–1199).');
      }

      const nameTaken = existing.some(
        (e) => e.name.toLowerCase() === name.toLowerCase() && e.isActive === '1' && !e.voidedAt,
      );
      if (nameTaken) throw new Error('A bank with this name already exists.');

      const seed = classifiedSeedValues({
        code: nextCode,
        name,
        type: 'asset',
        normalSide: 'debit',
      });
      try {
      const [row] = await db()
        .insert(accounts)
        .values({
          tenantId: user.tenantId,
          code: nextCode,
          name,
          type: 'asset',
          normalSide: 'debit',
          isActive: '1',
          subtype: seed.subtype,
          purpose: seed.purpose,
          isGroup: '0',
          isSystem: '0',
          isContra: '0',
          cashFlowClass: seed.cashFlowClass,
          liquidity: 'bank',
          reconcilable: '1',
          controlRole: 'bank',
        })
        .returning({ id: accounts.id, code: accounts.code, name: accounts.name });

      if (!row) throw new Error('Could not create bank.');
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        shortName: row.name,
        kind: 'bank' as const,
      };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new Error('That bank code was just used. Try again.');
        }
        throw error;
      }
    });

    revalidatePath('/cashbook');
    revalidatePath('/cashbook/settings');
    revalidatePath('/accounts');
    return { ok: true, account };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not add bank' };
  }
}

export async function renameCashbookBank(
  accountId: string,
  shortName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const name = shortName.trim().slice(0, 40);
    if (!name) return { ok: false, error: 'Enter a name.' };
    await assertBankWrite();
    const user = await requireTenantContext();
    await withTenantContext(user.tenantId, async () => {
      const [row] = await db()
        .select({ code: accounts.code })
        .from(accounts)
        .where(
          and(
            eq(accounts.tenantId, user.tenantId),
            eq(accounts.id, accountId),
            isNull(accounts.voidedAt),
          ),
        )
        .limit(1);
      if (!row) throw new Error('Bank not found.');
      if (row.code === '1000') throw new Error('Cash cannot be renamed here.');
      await db()
        .update(accounts)
        .set({ name, updatedAt: sql`NOW()` })
        .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, user.tenantId)));
    });
    revalidatePath('/cashbook');
    revalidatePath('/cashbook/settings');
    revalidatePath('/accounts');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Rename failed' };
  }
}

/** Soft-archive a custom bank (not Cash 1000). */
export async function archiveCashbookBank(
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertBankWrite();
    const user = await requireTenantContext();
    await withTenantContext(user.tenantId, async () => {
      const [row] = await db()
        .select({ code: accounts.code })
        .from(accounts)
        .where(
          and(
            eq(accounts.tenantId, user.tenantId),
            eq(accounts.id, accountId),
            isNull(accounts.voidedAt),
          ),
        )
        .limit(1);
      if (!row) throw new Error('Bank not found.');
      if (row.code === '1000') throw new Error('Cash cannot be removed.');
      await db()
        .update(accounts)
        .set({ voidedAt: sql`NOW()`, isActive: '0', updatedAt: sql`NOW()` })
        .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, user.tenantId)));
    });
    revalidatePath('/cashbook');
    revalidatePath('/cashbook/settings');
    revalidatePath('/accounts');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Remove failed' };
  }
}
