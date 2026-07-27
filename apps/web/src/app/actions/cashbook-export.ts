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

/**
 * Export pack v0 — CSV of cashbook rows for a period (tax / accountant handoff).
 */
export async function exportCashbookCsv(opts?: {
  bookDomain?: BookDomain | null;
  period?: string | null;
}): Promise<{ ok: true; filename: string; csv: string } | { ok: false; error: string }> {
  try {
    const user = await requireTenantContext();
    const { tenants } = await import('@bookone/db');
    const [t] = await db()
      .select({ entityKind: tenants.entityKind, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);
    const entityKind = parseEntityKind(t?.entityKind);
    const domain = resolveBookDomain(entityKind, opts?.bookDomain ?? null);
    const period = opts?.period ?? new Date().toISOString().slice(0, 7);

    const raw = await withTenantContext(user.tenantId, async () => {
      const conditions = [
        eq(transactions.tenantId, user.tenantId),
        isNull(transactions.voidedAt),
        gte(transactions.date, `${period}-01`),
        lte(transactions.date, `${period}-31`),
      ];
      if (entityKind === 'personal' || entityKind === 'sole_prop') {
        conditions.push(eq(transactions.bookDomain, domain));
      }
      return db()
        .select({
          date: transactions.date,
          party: transactions.party,
          description: transactions.description,
          direction: transactions.direction,
          amount: transactions.amount,
          currency: transactions.currency,
          bookDomain: transactions.bookDomain,
          categoryName: transactions.categoryName,
          categoryCode: transactions.categoryCode,
        })
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(2000);
    });

    const escape = (v: string | null | undefined) => {
      const s = String(v ?? '');
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header = [
      'date',
      'party',
      'description',
      'direction',
      'amount',
      'currency',
      'book_domain',
      'category_code',
      'category_name',
    ].join(',');

    const lines = raw.map((r) =>
      [
        escape(r.date),
        escape(r.party),
        escape(r.description),
        escape(r.direction),
        escape(String(r.amount)),
        escape(r.currency),
        escape(r.bookDomain),
        escape(r.categoryCode),
        escape(r.categoryName),
      ].join(','),
    );

    const slug = (t?.name || 'bookone')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const filename = `${slug}-${domain}-${period}.csv`;

    return {
      ok: true,
      filename,
      csv: [header, ...lines].join('\n') + '\n',
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed' };
  }
}
