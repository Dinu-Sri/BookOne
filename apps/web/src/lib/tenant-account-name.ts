import { accounts, and, db, eq, isNull, withTenantContext } from '@bookone/db';

/** The tenant's live (non-voided) account name for a code, or null. */
export async function tenantAccountName(tenantId: string, code: string): Promise<string | null> {
  return withTenantContext(tenantId, async () => {
    const [row] = await db()
      .select({ name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code), isNull(accounts.voidedAt)))
      .limit(1);
    return row?.name ?? null;
  });
}
