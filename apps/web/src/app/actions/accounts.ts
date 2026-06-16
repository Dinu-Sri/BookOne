'use server';

import { db, accounts, eq, and, isNull, asc } from '@bookone/db';
import { requireTenantContext } from '@bookone/auth';

export interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
  normalSide: string;
}

/**
 * Returns the active (non-voided) accounts for the current tenant,
 * ordered by code. Used by the Simple Entry form to populate the
 * "Paid from" / "Received to" / "From account" / "To account" selectors.
 */
export async function getActiveAccounts(): Promise<AccountOption[]> {
  const user = await requireTenantContext();

  const rows = await db()
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      normalSide: accounts.normalSide,
    })
    .from(accounts)
    .where(and(eq(accounts.tenantId, user.tenantId), isNull(accounts.voidedAt)))
    .orderBy(asc(accounts.code));

  return rows;
}
