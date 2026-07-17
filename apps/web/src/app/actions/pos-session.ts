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
