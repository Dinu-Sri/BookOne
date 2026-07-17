'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  db,
  desc,
  eq,
  isNull,
  posRegisters,
  posShifts,
  withTenantContext,
} from '@bookone/db';
import { createCommercialDocument } from '@/app/actions/commercial-docs';
import { listPosRegisters, type PosRegisterRow } from '@/app/actions/pos-registers';
import { listProducts } from '@/app/actions/inventory';
import { listActiveDiscounts } from '@/app/actions/commercial-docs';
import { getSalesSettings } from '@/app/actions/sales-settings';
import { listPartyOptions } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';

export interface PosProductLite {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  category: string | null;
  sellPrice: number;
  unitCost: number;
  productType: string;
  imageUrl: string | null;
  qtyOnHand: number;
}

export interface PosShiftRow {
  id: string;
  registerId: string;
  status: string;
  openingFloat: number;
  openedAt: string;
}

export interface PosBootstrap {
  tenantName: string;
  cashierName: string;
  registers: PosRegisterRow[];
  openShifts: PosShiftRow[];
  products: PosProductLite[];
  categories: string[];
  discounts: { id: string; name: string; discountType: string; value: number }[];
  partyOptions: { id: string; name: string; code: string | null }[];
  vatRegistered: boolean;
  vatRatePercent: number;
}

export async function getPosBootstrap(): Promise<PosBootstrap> {
  const user = await requireTenantContext();
  const [tenant, registers, products, discounts, partyOptions, settings, openShifts] =
    await Promise.all([
      getTenantInfo(),
      listPosRegisters(),
      listProducts({ status: 'active', sort: 'name', dir: 'asc' }),
      listActiveDiscounts(),
      listPartyOptions('customer'),
      getSalesSettings(),
      withTenantContext(user.tenantId, async () => {
        const rows = await db()
          .select()
          .from(posShifts)
          .where(
            and(
              eq(posShifts.tenantId, user.tenantId),
              eq(posShifts.status, 'open'),
            ),
          )
          .orderBy(desc(posShifts.openedAt));
        return rows.map((s) => ({
          id: s.id,
          registerId: s.registerId,
          status: s.status,
          openingFloat: Number(s.openingFloat),
          openedAt: s.openedAt.toISOString(),
        }));
      }),
    ]);

  const sellable = products.filter((p) => p.sellable !== false && p.isActive === '1');
  const categories = Array.from(
    new Set(sellable.map((p) => p.category).filter((c): c is string => Boolean(c))),
  ).sort();

  return {
    tenantName: tenant.name,
    cashierName: tenant.userEmail ?? 'Cashier',
    registers: registers.filter((r) => r.isActive),
    openShifts,
    products: sellable.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      barcode: p.barcode,
      category: p.category,
      sellPrice: p.sellPrice,
      unitCost: p.unitCost,
      productType: p.productType,
      imageUrl: p.imageUrl ?? null,
      qtyOnHand: p.qtyOnHand,
    })),
    categories,
    discounts: discounts.map((d) => ({
      id: d.id,
      name: d.name,
      discountType: d.discountType,
      value: Number(d.value),
    })),
    partyOptions: partyOptions.map((p) => ({ id: p.id, name: p.name, code: p.code })),
    vatRegistered: settings.vatRegistered,
    vatRatePercent: settings.vatRatePercent,
  };
}

export async function openPosShift(input: {
  registerId: string;
  openingFloat?: number;
}): Promise<{ ok: boolean; error?: string; shiftId?: string }> {
  try {
    const user = await requireTenantContext();
    const float = Math.max(0, Number(input.openingFloat ?? 0) || 0);

    const shiftId = await withTenantContext(user.tenantId, async () => {
      const [reg] = await db()
        .select()
        .from(posRegisters)
        .where(
          and(
            eq(posRegisters.tenantId, user.tenantId),
            eq(posRegisters.id, input.registerId),
            isNull(posRegisters.voidedAt),
            eq(posRegisters.isActive, '1'),
          ),
        )
        .limit(1);
      if (!reg) throw new Error('Register not found or inactive.');

      const [existing] = await db()
        .select({ id: posShifts.id })
        .from(posShifts)
        .where(
          and(
            eq(posShifts.tenantId, user.tenantId),
            eq(posShifts.registerId, input.registerId),
            eq(posShifts.status, 'open'),
          ),
        )
        .limit(1);
      if (existing) return existing.id;

      const [created] = await db()
        .insert(posShifts)
        .values({
          tenantId: user.tenantId,
          registerId: input.registerId,
          openedBy: user.id,
          status: 'open',
          openingFloat: float.toFixed(2),
        })
        .returning({ id: posShifts.id });
      return created.id;
    });

    revalidatePath('/pos');
    return { ok: true, shiftId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not open shift.' };
  }
}

const completeSaleSchema = z.object({
  registerId: z.string().uuid(),
  shiftId: z.string().uuid(),
  partyName: z.string().min(1).max(255).default('Walk-in'),
  invoiceKind: z.enum(['commercial', 'tax_invoice']).default('commercial'),
  tender: z.enum(['cash', 'card', 'bank', 'mixed']),
  cashAmount: z.number().min(0).optional().default(0),
  cardAmount: z.number().min(0).optional().default(0),
  bankAmount: z.number().min(0).optional().default(0),
  headerDiscount: z.number().min(0).optional().default(0),
  discountId: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid().optional().nullable(),
        description: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().min(0),
      }),
    )
    .min(1),
});

function paymentCodeForTender(tender: string, registerDefault: string): string {
  if (tender === 'card') return '1200';
  if (tender === 'bank') return '1100';
  if (tender === 'cash') return registerDefault || '1000';
  // mixed: prefer cash account for posting; breakdown in notes
  return registerDefault || '1000';
}

export async function completePosSale(
  input: z.input<typeof completeSaleSchema>,
): Promise<{ ok: boolean; error?: string; id?: string; documentNumber?: string }> {
  try {
    const parsed = completeSaleSchema.parse(input);
    const user = await requireTenantContext();

    const register = await withTenantContext(user.tenantId, async () => {
      const [reg] = await db()
        .select()
        .from(posRegisters)
        .where(
          and(
            eq(posRegisters.tenantId, user.tenantId),
            eq(posRegisters.id, parsed.registerId),
            isNull(posRegisters.voidedAt),
          ),
        )
        .limit(1);
      if (!reg) throw new Error('Register not found.');

      const [shift] = await db()
        .select()
        .from(posShifts)
        .where(
          and(
            eq(posShifts.tenantId, user.tenantId),
            eq(posShifts.id, parsed.shiftId),
            eq(posShifts.registerId, parsed.registerId),
            eq(posShifts.status, 'open'),
          ),
        )
        .limit(1);
      if (!shift) throw new Error('No open shift for this register. Open a shift first.');
      return reg;
    });

    const payCode = paymentCodeForTender(parsed.tender, register.defaultPaymentAccountCode);
    const tenderNote =
      parsed.tender === 'mixed'
        ? `Mixed tender cash=${parsed.cashAmount} card=${parsed.cardAmount} bank=${parsed.bankAmount}`
        : `Tender: ${parsed.tender}`;

    const result = await createCommercialDocument({
      documentType: 'pos_sale',
      partyName: parsed.partyName || 'Walk-in',
      issueDate: new Date().toISOString().slice(0, 10),
      paymentAccountCode: payCode,
      paymentMode:
        parsed.tender === 'cash'
          ? 'Cash'
          : parsed.tender === 'card'
            ? 'Card'
            : parsed.tender === 'bank'
              ? 'Bank'
              : 'Mixed',
      invoiceKind: parsed.invoiceKind,
      saleChannel: 'local',
      headerDiscount: parsed.headerDiscount ?? 0,
      discountId: parsed.discountId ?? null,
      notes: [parsed.notes, tenderNote].filter(Boolean).join(' · '),
      registerId: parsed.registerId,
      shiftId: parsed.shiftId,
      posMode: 'sale',
      lines: parsed.lines.map((l) => ({
        productId: l.productId ?? null,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unitCost: 0,
        discountAmount: 0,
      })),
    });

    if (!result.ok || !result.id) {
      return { ok: false, error: result.error ?? 'Sale failed.' };
    }

    // Fetch document number for receipt
    let documentNumber = result.id;
    await withTenantContext(user.tenantId, async () => {
      const { businessDocuments } = await import('@bookone/db');
      const [doc] = await db()
        .select({ documentNumber: businessDocuments.documentNumber })
        .from(businessDocuments)
        .where(eq(businessDocuments.id, result.id!))
        .limit(1);
      if (doc) documentNumber = doc.documentNumber;
    });

    revalidatePath('/pos');
    revalidatePath('/sales/pos');
    revalidatePath('/transactions');
    return { ok: true, id: result.id, documentNumber };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Sale failed.' };
  }
}

export interface PosTicketLine {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Remaining qty available to return */
  remainingQty: number;
}

export interface PosTicket {
  id: string;
  documentNumber: string;
  issueDate: string;
  partyName: string;
  total: number;
  paymentMode: string | null;
  status: string;
  lines: PosTicketLine[];
}

export interface PosTicketSummary {
  id: string;
  documentNumber: string;
  issueDate: string;
  partyName: string;
  total: number;
  status: string;
}

/** Recent POS sales for return picker (newest first). */
export async function listRecentPosSales(limit = 25): Promise<PosTicketSummary[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const { businessDocuments, parties } = await import('@bookone/db');
    const rows = await db()
      .select({
        id: businessDocuments.id,
        documentNumber: businessDocuments.documentNumber,
        issueDate: businessDocuments.issueDate,
        partyName: parties.name,
        total: businessDocuments.total,
        status: businessDocuments.status,
      })
      .from(businessDocuments)
      .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
      .where(
        and(
          eq(businessDocuments.tenantId, user.tenantId),
          eq(businessDocuments.documentType, 'pos_sale'),
          isNull(businessDocuments.voidedAt),
        ),
      )
      .orderBy(desc(businessDocuments.issueDate), desc(businessDocuments.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      documentNumber: r.documentNumber,
      issueDate: r.issueDate,
      partyName: r.partyName ?? 'Walk-in',
      total: Number(r.total),
      status: r.status,
    }));
  });
}

/** Lookup a POS sale by document number (exact or contains) or id. */
export async function lookupPosSale(query: string): Promise<{
  ok: boolean;
  error?: string;
  ticket?: PosTicket;
}> {
  try {
    const q = query.trim();
    if (!q) return { ok: false, error: 'Enter a receipt number.' };

    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const { businessDocuments, businessDocumentLines, parties, sql } = await import('@bookone/db');

      const conditions = [
        eq(businessDocuments.tenantId, user.tenantId),
        eq(businessDocuments.documentType, 'pos_sale'),
        isNull(businessDocuments.voidedAt),
      ];

      // UUID?
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);
      let docs;
      if (isUuid) {
        docs = await db()
          .select()
          .from(businessDocuments)
          .where(and(...conditions, eq(businessDocuments.id, q)))
          .limit(1);
      } else {
        const like = `%${q.toUpperCase()}%`;
        docs = await db()
          .select()
          .from(businessDocuments)
          .where(
            and(
              ...conditions,
              sql`upper(${businessDocuments.documentNumber}) like ${like}`,
            ),
          )
          .orderBy(desc(businessDocuments.issueDate))
          .limit(5);
      }

      if (docs.length === 0) return { ok: false, error: `No POS sale found for “${q}”.` };
      if (docs.length > 1) {
        // Prefer exact number match
        const exact = docs.find((d) => d.documentNumber.toUpperCase() === q.toUpperCase());
        if (!exact) {
          return {
            ok: false,
            error: `Multiple matches. Use full receipt no. e.g. ${docs[0].documentNumber}`,
          };
        }
        docs = [exact];
      }

      const doc = docs[0];
      const [party] = await db().select().from(parties).where(eq(parties.id, doc.partyId)).limit(1);
      const lines = await db()
        .select()
        .from(businessDocumentLines)
        .where(
          and(eq(businessDocumentLines.documentId, doc.id), isNull(businessDocumentLines.voidedAt)),
        );

      // Sum already returned qty per product/description from linked returns
      const priorReturns = await db()
        .select({ id: businessDocuments.id })
        .from(businessDocuments)
        .where(
          and(
            eq(businessDocuments.tenantId, user.tenantId),
            eq(businessDocuments.documentType, 'sales_return'),
            eq(businessDocuments.sourcePosSaleId, doc.id),
            isNull(businessDocuments.voidedAt),
          ),
        );

      const returnedByKey = new Map<string, number>();
      for (const ret of priorReturns) {
        const retLines = await db()
          .select()
          .from(businessDocumentLines)
          .where(
            and(
              eq(businessDocumentLines.documentId, ret.id),
              isNull(businessDocumentLines.voidedAt),
            ),
          );
        for (const rl of retLines) {
          const key = `${rl.productId ?? ''}|${rl.description}`;
          returnedByKey.set(key, (returnedByKey.get(key) ?? 0) + Number(rl.quantity));
        }
      }

      const ticketLines: PosTicketLine[] = lines.map((l) => {
        const key = `${l.productId ?? ''}|${l.description}`;
        const sold = Number(l.quantity);
        const already = returnedByKey.get(key) ?? 0;
        const remaining = Math.max(0, Math.round((sold - already) * 10000) / 10000);
        return {
          id: l.id,
          productId: l.productId,
          description: l.description,
          quantity: sold,
          unitPrice: Number(l.unitPrice),
          lineTotal: Number(l.lineTotal),
          remainingQty: remaining,
        };
      });

      const remainingTotal = ticketLines.reduce((s, l) => s + l.remainingQty, 0);
      if (remainingTotal <= 0) {
        return { ok: false, error: 'This ticket is already fully returned.' };
      }

      return {
        ok: true,
        ticket: {
          id: doc.id,
          documentNumber: doc.documentNumber,
          issueDate: doc.issueDate,
          partyName: party?.name ?? 'Walk-in',
          total: Number(doc.total),
          paymentMode: doc.paymentMode,
          status: doc.status,
          lines: ticketLines,
        },
      };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Lookup failed.' };
  }
}

const completeReturnSchema = z.object({
  registerId: z.string().uuid(),
  shiftId: z.string().uuid(),
  sourcePosSaleId: z.string().uuid().optional().nullable(),
  partyName: z.string().min(1).max(255).default('Walk-in'),
  refundTender: z.enum(['cash', 'card', 'bank']),
  reason: z.string().max(500).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid().optional().nullable(),
        description: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().min(0),
      }),
    )
    .min(1),
});

export async function completePosReturn(
  input: z.input<typeof completeReturnSchema>,
): Promise<{ ok: boolean; error?: string; id?: string; documentNumber?: string }> {
  try {
    const parsed = completeReturnSchema.parse(input);
    const user = await requireTenantContext();

    if (parsed.sourcePosSaleId) {
      const lookup = await lookupPosSale(parsed.sourcePosSaleId);
      if (!lookup.ok || !lookup.ticket) {
        return { ok: false, error: lookup.error ?? 'Original sale not found.' };
      }
      for (const line of parsed.lines) {
        const key = `${line.productId ?? ''}|${line.description}`;
        const orig = lookup.ticket.lines.find(
          (l) => `${l.productId ?? ''}|${l.description}` === key,
        );
        if (!orig) {
          return { ok: false, error: `Line not on original ticket: ${line.description}` };
        }
        if (line.quantity > orig.remainingQty + 0.0001) {
          return {
            ok: false,
            error: `Return qty ${line.quantity} exceeds remaining ${orig.remainingQty} for ${line.description}`,
          };
        }
      }
    }

    const register = await withTenantContext(user.tenantId, async () => {
      const [reg] = await db()
        .select()
        .from(posRegisters)
        .where(
          and(
            eq(posRegisters.tenantId, user.tenantId),
            eq(posRegisters.id, parsed.registerId),
            isNull(posRegisters.voidedAt),
          ),
        )
        .limit(1);
      if (!reg) throw new Error('Register not found.');

      const [shift] = await db()
        .select()
        .from(posShifts)
        .where(
          and(
            eq(posShifts.tenantId, user.tenantId),
            eq(posShifts.id, parsed.shiftId),
            eq(posShifts.registerId, parsed.registerId),
            eq(posShifts.status, 'open'),
          ),
        )
        .limit(1);
      if (!shift) throw new Error('No open shift for this register.');
      return reg;
    });

    const payCode = paymentCodeForTender(parsed.refundTender, register.defaultPaymentAccountCode);
    const noteParts = [
      'POS return',
      parsed.sourcePosSaleId ? `from sale ${parsed.sourcePosSaleId.slice(0, 8)}…` : 'free return',
      parsed.reason ? `Reason: ${parsed.reason}` : null,
      `Refund: ${parsed.refundTender}`,
    ].filter(Boolean);

    const result = await createCommercialDocument({
      documentType: 'sales_return',
      partyName: parsed.partyName || 'Walk-in',
      issueDate: new Date().toISOString().slice(0, 10),
      paymentAccountCode: payCode,
      paymentMode:
        parsed.refundTender === 'cash'
          ? 'Cash'
          : parsed.refundTender === 'card'
            ? 'Card'
            : 'Bank',
      invoiceKind: 'commercial',
      saleChannel: 'local',
      notes: noteParts.join(' · '),
      registerId: parsed.registerId,
      shiftId: parsed.shiftId,
      posMode: 'return',
      sourcePosSaleId: parsed.sourcePosSaleId ?? null,
      sourceDocumentId: parsed.sourcePosSaleId ?? null,
      lines: parsed.lines.map((l) => ({
        productId: l.productId ?? null,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        unitCost: 0,
        discountAmount: 0,
      })),
    });

    if (!result.ok || !result.id) {
      return { ok: false, error: result.error ?? 'Return failed.' };
    }

    let documentNumber = result.id;
    await withTenantContext(user.tenantId, async () => {
      const { businessDocuments } = await import('@bookone/db');
      const [doc] = await db()
        .select({ documentNumber: businessDocuments.documentNumber })
        .from(businessDocuments)
        .where(eq(businessDocuments.id, result.id!))
        .limit(1);
      if (doc) documentNumber = doc.documentNumber;
    });

    revalidatePath('/pos');
    revalidatePath('/sales/pos');
    revalidatePath('/sales/returns');
    revalidatePath('/transactions');
    return { ok: true, id: result.id, documentNumber };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Return failed.' };
  }
}

export async function getPosReceiptData(saleId: string) {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const { businessDocuments, businessDocumentLines, parties, companyProfiles } = await import(
      '@bookone/db'
    );
    const [doc] = await db()
      .select()
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.tenantId, user.tenantId),
          eq(businessDocuments.id, saleId),
          isNull(businessDocuments.voidedAt),
        ),
      )
      .limit(1);
    if (!doc) return null;

    const [party] = await db().select().from(parties).where(eq(parties.id, doc.partyId)).limit(1);
    const lines = await db()
      .select()
      .from(businessDocumentLines)
      .where(
        and(eq(businessDocumentLines.documentId, doc.id), isNull(businessDocumentLines.voidedAt)),
      );

    const [company] = await db()
      .select()
      .from(companyProfiles)
      .where(eq(companyProfiles.tenantId, user.tenantId))
      .limit(1);

    let register: { name: string; code: string; printMode: string; receiptFooter: string | null } | null =
      null;
    if (doc.registerId) {
      const [reg] = await db()
        .select()
        .from(posRegisters)
        .where(eq(posRegisters.id, doc.registerId))
        .limit(1);
      if (reg) {
        register = {
          name: reg.name,
          code: reg.code,
          printMode: reg.printMode,
          receiptFooter: reg.receiptFooter,
        };
      }
    }

    return { doc, party, lines, company, register };
  });
}
