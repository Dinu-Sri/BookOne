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
  accountingType?: string | null;
};

export type CashbookTotals = {
  rows: CashbookRow[];
  moneyIn: number;
  moneyOut: number;
  net: number;
  /** Unsettled AR-style (invoice_bill customer) */
  receivables: number;
  /** Unsettled AP-style (invoice_bill vendor) */
  payables: number;
};

async function queryDomain(
  tenantId: string,
  entityKind: ReturnType<typeof parseEntityKind>,
  domain: BookDomain,
  fromDate: string,
  toDate: string,
  limit: number,
): Promise<CashbookTotals> {
  return withTenantContext(tenantId, async () => {
    const conditions = [
      eq(transactions.tenantId, tenantId),
      isNull(transactions.voidedAt),
      gte(transactions.date, fromDate),
      lte(transactions.date, toDate),
    ];
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
        accountingType: transactions.accountingType,
        isAlreadySettled: transactions.isAlreadySettled,
      })
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(limit);

    let moneyIn = 0;
    let moneyOut = 0;
    let receivables = 0;
    let payables = 0;

    const rows: CashbookRow[] = raw.map((r) => {
      const amount = Number(r.amount);
      const settled = String(r.isAlreadySettled ?? '') === '1';

      if (r.direction === 'money_in') moneyIn += amount;
      else if (r.direction === 'money_out') moneyOut += amount;
      else if (r.direction === 'invoice_bill') {
        // Credit sales increase "in" economic view; credit purchases "out"
        if (r.accountingType === 'SaleCredit') {
          moneyIn += amount;
          if (!settled) receivables += amount;
        } else if (r.accountingType === 'PurchaseCredit') {
          moneyOut += amount;
          if (!settled) payables += amount;
        }
      }

      return {
        id: r.id,
        date: r.date,
        party: r.party,
        description: r.description,
        direction: r.direction,
        amount,
        currency: r.currency,
        bookDomain: r.bookDomain,
        accountingType: r.accountingType,
      };
    });

    return {
      rows,
      moneyIn,
      moneyOut,
      net: moneyIn - moneyOut,
      receivables,
      payables,
    };
  });
}

export async function listCashbookRows(opts?: {
  bookDomain?: BookDomain | null;
  period?: string | null; // YYYY-MM
  limit?: number;
}): Promise<CashbookTotals> {
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

  return queryDomain(
    user.tenantId,
    entityKind,
    domain,
    `${period}-01`,
    `${period}-31`,
    limit,
  );
}

/** Calendar year totals for personal + business (sole combined tax overview). */
export async function listYearDomainTotals(opts?: {
  year?: number;
}): Promise<{
  year: number;
  personal: CashbookTotals;
  business: CashbookTotals | null;
  combinedNet: number;
}> {
  const user = await requireTenantContext();
  const { tenants } = await import('@bookone/db');
  const [t] = await db()
    .select({ entityKind: tenants.entityKind })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);
  const entityKind = parseEntityKind(t?.entityKind);
  const year = opts?.year ?? new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const personal = await queryDomain(user.tenantId, entityKind, 'personal', from, to, 5000);
  const business =
    entityKind === 'sole_prop'
      ? await queryDomain(user.tenantId, entityKind, 'business', from, to, 5000)
      : null;

  const combinedNet = personal.net + (business?.net ?? 0);
  return { year, personal, business, combinedNet };
}
