'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import {
  auditLog,
  businessDocuments,
  db,
  parties,
  eq,
  and,
  isNull,
  or,
  asc,
  sql,
  withTenantContext,
} from '@bookone/db';

const partyKindSchema = z.enum(['customer', 'vendor', 'both']);

const partyInputSchema = z.object({
  name: z.string().min(1).max(255),
  kind: partyKindSchema.default('customer'),
  code: z.string().max(40).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  address: z.string().max(500).optional(),
  taxId: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

export interface PartyRow {
  id: string;
  name: string;
  kind: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  openBalance: number;
}

function cleanNullable(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function listParties(filter?: {
  kind?: 'customer' | 'vendor' | 'all';
}): Promise<PartyRow[]> {
  const user = await requireTenantContext();
  const kind = filter?.kind ?? 'all';

  return withTenantContext(user.tenantId, async () => {
    const conditions = [eq(parties.tenantId, user.tenantId), isNull(parties.voidedAt)];
    if (kind === 'customer') {
      conditions.push(or(eq(parties.kind, 'customer'), eq(parties.kind, 'both'))!);
    } else if (kind === 'vendor') {
      conditions.push(or(eq(parties.kind, 'vendor'), eq(parties.kind, 'both'))!);
    }

    const rows = await db()
      .select({
        id: parties.id,
        name: parties.name,
        kind: parties.kind,
        code: parties.code,
        phone: parties.phone,
        email: parties.email,
        address: parties.address,
        taxId: parties.taxId,
        notes: parties.notes,
      })
      .from(parties)
      .where(and(...conditions))
      .orderBy(asc(parties.name));

    const balances = await db()
      .select({
        partyId: businessDocuments.partyId,
        balance: sql<string>`coalesce(sum(${businessDocuments.balanceDue}::numeric), 0)`,
      })
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.tenantId, user.tenantId),
          isNull(businessDocuments.voidedAt),
          inDocTypesForKind(kind),
        ),
      )
      .groupBy(businessDocuments.partyId);

    const balanceMap = new Map(balances.map((b) => [b.partyId, Number(b.balance)]));

    return rows.map((row) => ({
      ...row,
      openBalance: balanceMap.get(row.id) ?? 0,
    }));
  });
}

function inDocTypesForKind(kind: string) {
  if (kind === 'vendor') {
    return or(
      eq(businessDocuments.documentType, 'vendor_bill'),
      eq(businessDocuments.documentType, 'purchase'),
      eq(businessDocuments.documentType, 'import_purchase'),
      eq(businessDocuments.documentType, 'purchase_return'),
      eq(businessDocuments.documentType, 'purchase_order'),
    )!;
  }
  // customers + all: sales-side open balances
  return or(
    eq(businessDocuments.documentType, 'sales_invoice'),
    eq(businessDocuments.documentType, 'customer_invoice'),
    eq(businessDocuments.documentType, 'pos_sale'),
    eq(businessDocuments.documentType, 'sales_return'),
  )!;
}

export async function ensureParty(input: z.infer<typeof partyInputSchema>): Promise<PartyRow> {
  const parsed = partyInputSchema.parse(input);
  const user = await requireTenantContext();

  return withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select({
        id: parties.id,
        name: parties.name,
        kind: parties.kind,
        code: parties.code,
        phone: parties.phone,
        email: parties.email,
        address: parties.address,
        taxId: parties.taxId,
        notes: parties.notes,
      })
      .from(parties)
      .where(
        and(
          eq(parties.tenantId, user.tenantId),
          sql`lower(${parties.name}) = lower(${parsed.name.trim()})`,
          isNull(parties.voidedAt),
        ),
      )
      .limit(1);

    if (existing) {
      return { ...existing, openBalance: 0 };
    }

    const [created] = await db()
      .insert(parties)
      .values({
        tenantId: user.tenantId,
        name: parsed.name.trim(),
        kind: parsed.kind,
        code: cleanNullable(parsed.code),
        phone: cleanNullable(parsed.phone),
        email: cleanNullable(parsed.email),
        address: cleanNullable(parsed.address),
        taxId: cleanNullable(parsed.taxId),
        notes: cleanNullable(parsed.notes),
      })
      .returning({
        id: parties.id,
        name: parties.name,
        kind: parties.kind,
        code: parties.code,
        phone: parties.phone,
        email: parties.email,
        address: parties.address,
        taxId: parties.taxId,
        notes: parties.notes,
      });

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CREATE',
      tableName: 'parties',
      recordId: created.id,
      newValues: { name: created.name, kind: created.kind },
      notes: 'Created party.',
    });

    return { ...created, openBalance: 0 };
  });
}

export async function createPartyFromForm(formData: FormData): Promise<void> {
  const kind = String(formData.get('kind') ?? 'customer') as z.infer<typeof partyKindSchema>;
  await ensureParty({
    name: String(formData.get('name') ?? ''),
    kind,
    code: String(formData.get('code') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    address: String(formData.get('address') ?? ''),
    taxId: String(formData.get('taxId') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });
  revalidatePath('/parties');
  revalidatePath('/parties/customers');
  revalidatePath('/parties/vendors');
  revalidatePath('/documents');
  const { redirect } = await import('next/navigation');
  redirect(kind === 'vendor' ? '/parties/vendors' : '/parties/customers');
}
