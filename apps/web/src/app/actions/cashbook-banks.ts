'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  and,
  db,
  eq,
  isNull,
  asc,
  sql,
  withTenantContext,
} from '@bookone/db';

export type LiquidAccount = {
  id: string;
  code: string;
  name: string;
  /** Short label for tiles (name, trimmed) */
  shortName: string;
  kind: 'cash' | 'bank' | 'card';
};

function classify(code: string): 'cash' | 'bank' | 'card' {
  if (code === '1000') return 'cash';
  if (code === '1200' || code.startsWith('12')) return 'card';
  return 'bank';
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
      .filter((r) => {
        const c = r.code;
        return c === '1000' || c === '1100' || c === '1200' || /^11\d{2}$/.test(c) || /^12\d{2}$/.test(c);
      })
      .map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        shortName: r.name.replace(/^Bank\s*[·\-–:]?\s*/i, '').trim() || r.name,
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

    const user = await requireTenantContext();
    const account = await withTenantContext(user.tenantId, async () => {
      const existing = await db()
        .select({ code: accounts.code, name: accounts.name })
        .from(accounts)
        .where(and(eq(accounts.tenantId, user.tenantId), isNull(accounts.voidedAt)));

      const used = new Set(existing.map((e) => e.code));
      let nextCode: string | null = null;
      for (let n = 1101; n <= 1199; n++) {
        const c = String(n);
        if (!used.has(c)) {
          nextCode = c;
          break;
        }
      }
      if (!nextCode) {
        throw new Error('Maximum number of bank accounts reached (1101–1199).');
      }

      const dup = existing.find((e) => e.name.toLowerCase() === name.toLowerCase());
      if (dup) throw new Error('A bank with this name already exists.');

      const [row] = await db()
        .insert(accounts)
        .values({
          tenantId: user.tenantId,
          code: nextCode,
          name,
          type: 'asset',
          normalSide: 'debit',
          isActive: '1',
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
    });

    revalidatePath('/cashbook');
    revalidatePath('/cashbook/settings');
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
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Remove failed' };
  }
}
