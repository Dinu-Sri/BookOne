'use server';

import { requireTenantContext } from '@bookone/auth';
import {
  db,
  eq,
  and,
  isNull,
  desc,
  gte,
  lte,
  transactions,
  withTenantContext,
} from '@bookone/db';
import { parseEntityKind, resolveBookDomain, type BookDomain } from '@/lib/entity-kind';

export type CashbookRow = {
  id: string;
  date: string;
  party: string;
  description: string;
  direction: string;
  amount: number;
  currency: string;
  bookDomain: string | null;
};

export async function listCashbookRows(opts?: {
  bookDomain?: BookDomain | null;
  period?: string | null; // YYYY-MM
  limit?: number;
}): Promise<{
  rows: CashbookRow[];
  moneyIn: number;
  moneyOut: number;
  net: number;
}> {
  const user = await requireTenantContext();
  const { tenants } = await import('@bookone/db');
  const [t] = await db()
    .select({ entityKind: tenants.entityKind })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);
  const entityKind = parseEntityKind(t?.entityKind);
  const domain = resolveBookDomain(entityKind, opts?.bookDomain ?? null);
  const period = opts?.period ?? new Date().toISOString().slice(0, 7);
  const limit = opts?.limit ?? 100;

  return withTenantContext(user.tenantId, async () => {
    const conditions = [
      eq(transactions.tenantId, user.tenantId),
      isNull(transactions.voidedAt),
      gte(transactions.date, `${period}-01`),
      lte(transactions.date, `${period}-31`),
    ];
    // Filter domain when column present; sole_prop must match; company may be null/business
    if (entityKind === 'personal' || entityKind === 'sole_prop') {
      conditions.push(eq(transactions.bookDomain, domain));
    }

    const raw = await db()
      .select({
        id: transactions.id,
        date: transactions.date,
        party: transactions.party,
        description: transactions.description,
        direction: transactions.direction,
        amount: transactions.amount,
        currency: transactions.currency,
        bookDomain: transactions.bookDomain,
      })
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(limit);

    let moneyIn = 0;
    let moneyOut = 0;
    const rows: CashbookRow[] = raw.map((r) => {
      const amount = Number(r.amount);
      if (r.direction === 'money_in') moneyIn += amount;
      else if (r.direction === 'money_out') moneyOut += amount;
      return {
        id: r.id,
        date: r.date,
        party: r.party,
        description: r.description,
        direction: r.direction,
        amount,
        currency: r.currency,
        bookDomain: r.bookDomain,
      };
    });

    return {
      rows,
      moneyIn,
      moneyOut,
      net: moneyIn - moneyOut,
    };
  });
}
