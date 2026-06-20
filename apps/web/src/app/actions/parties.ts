'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { auditLog, db, parties, eq, and, isNull, asc, sql, withTenantContext } from '@bookone/db';

const partyKindSchema = z.enum(['customer', 'vendor', 'both']);

const partyInputSchema = z.object({
  name: z.string().min(1).max(255),
  kind: partyKindSchema.default('customer'),
  phone: z.string().max(30).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  address: z.string().max(500).optional(),
});

export interface PartyRow {
  id: string;
  name: string;
  kind: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

function cleanNullable(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function listParties(): Promise<PartyRow[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: parties.id,
        name: parties.name,
        kind: parties.kind,
        phone: parties.phone,
        email: parties.email,
        address: parties.address,
      })
      .from(parties)
      .where(and(eq(parties.tenantId, user.tenantId), isNull(parties.voidedAt)))
      .orderBy(asc(parties.name));
    return rows;
  });
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
        phone: parties.phone,
        email: parties.email,
        address: parties.address,
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

    if (existing) return existing;

    const [created] = await db()
      .insert(parties)
      .values({
        tenantId: user.tenantId,
        name: parsed.name.trim(),
        kind: parsed.kind,
        phone: cleanNullable(parsed.phone),
        email: cleanNullable(parsed.email),
        address: cleanNullable(parsed.address),
      })
      .returning({
        id: parties.id,
        name: parties.name,
        kind: parties.kind,
        phone: parties.phone,
        email: parties.email,
        address: parties.address,
      });

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CREATE',
      tableName: 'parties',
      recordId: created.id,
      newValues: { name: created.name, kind: created.kind },
      notes: 'Created reusable customer/vendor party.',
    });

    return created;
  });
}

export async function createPartyFromForm(formData: FormData): Promise<void> {
  await ensureParty({
    name: String(formData.get('name') ?? ''),
    kind: String(formData.get('kind') ?? 'customer') as z.infer<typeof partyKindSchema>,
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    address: String(formData.get('address') ?? ''),
  });
  revalidatePath('/parties');
  revalidatePath('/documents');
}
