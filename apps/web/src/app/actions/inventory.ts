'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { buildStockAdjustmentPosting } from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  auditLog,
  db,
  eq,
  and,
  isNull,
  desc,
  asc,
  sql,
  inventoryProducts,
  inventoryStockLevels,
  inventoryStockDocs,
  inventoryStockDocLines,
  inventoryMovements,
  journalEntries,
  journalLines,
  periodLocks,
  transactions,
  withTenantContext,
} from '@bookone/db';

const productSchema = z.object({
  sku: z.string().min(1).max(80),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  productType: z.enum(['stocked', 'service']).default('stocked'),
  unit: z.string().max(40).default('ea'),
  unitCost: z.number().min(0).default(0),
  sellPrice: z.number().min(0).default(0),
  openingQty: z.number().default(0),
});

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  productType: string;
  unit: string;
  unitCost: number;
  sellPrice: number;
  qtyOnHand: number;
  isActive: string;
}

async function resolveAccount(tenantId: string, code: string) {
  const [account] = await db()
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code), isNull(accounts.voidedAt)))
    .limit(1);
  if (!account) throw new Error(`Account ${code} not found.`);
  return account;
}

async function assertOpenPeriod(tenantId: string, date: string) {
  const period = date.slice(0, 7);
  const [lock] = await db()
    .select({ id: periodLocks.id })
    .from(periodLocks)
    .where(
      and(
        eq(periodLocks.tenantId, tenantId),
        eq(periodLocks.period, period),
        eq(periodLocks.status, 'locked'),
        isNull(periodLocks.voidedAt),
      ),
    )
    .limit(1);
  if (lock) throw new Error(`Period ${period} is locked.`);
}

export async function listProducts(): Promise<ProductRow[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: inventoryProducts.id,
        sku: inventoryProducts.sku,
        name: inventoryProducts.name,
        productType: inventoryProducts.productType,
        unit: inventoryProducts.unit,
        unitCost: inventoryProducts.unitCost,
        sellPrice: inventoryProducts.sellPrice,
        isActive: inventoryProducts.isActive,
        qtyOnHand: sql<string>`coalesce(sum(${inventoryStockLevels.qtyOnHand}::numeric), 0)`,
      })
      .from(inventoryProducts)
      .leftJoin(
        inventoryStockLevels,
        and(
          eq(inventoryStockLevels.productId, inventoryProducts.id),
          eq(inventoryStockLevels.tenantId, user.tenantId),
        ),
      )
      .where(and(eq(inventoryProducts.tenantId, user.tenantId), isNull(inventoryProducts.voidedAt)))
      .groupBy(
        inventoryProducts.id,
        inventoryProducts.sku,
        inventoryProducts.name,
        inventoryProducts.productType,
        inventoryProducts.unit,
        inventoryProducts.unitCost,
        inventoryProducts.sellPrice,
        inventoryProducts.isActive,
      )
      .orderBy(asc(inventoryProducts.name));

    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      productType: r.productType,
      unit: r.unit,
      unitCost: Number(r.unitCost),
      sellPrice: Number(r.sellPrice),
      qtyOnHand: Number(r.qtyOnHand),
      isActive: r.isActive,
    }));
  });
}

export async function createProductFromForm(formData: FormData): Promise<void> {
  const parsed = productSchema.parse({
    sku: String(formData.get('sku') ?? ''),
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    productType: String(formData.get('productType') ?? 'stocked'),
    unit: String(formData.get('unit') ?? 'ea'),
    unitCost: Number(String(formData.get('unitCost') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
    sellPrice: Number(String(formData.get('sellPrice') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
    openingQty: Number(String(formData.get('openingQty') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
  });

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const [product] = await db()
      .insert(inventoryProducts)
      .values({
        tenantId: user.tenantId,
        sku: parsed.sku.trim(),
        name: parsed.name.trim(),
        description: parsed.description?.trim() || null,
        productType: parsed.productType,
        unit: parsed.unit,
        unitCost: parsed.unitCost.toFixed(2),
        sellPrice: parsed.sellPrice.toFixed(2),
      })
      .returning({ id: inventoryProducts.id });

    await db().insert(inventoryStockLevels).values({
      tenantId: user.tenantId,
      productId: product.id,
      locationId: null,
      qtyOnHand: parsed.openingQty.toFixed(4),
    });

    if (parsed.openingQty !== 0) {
      await db().insert(inventoryMovements).values({
        tenantId: user.tenantId,
        userId: user.id,
        movementType: 'adjustment',
        productId: product.id,
        quantity: parsed.openingQty.toFixed(4),
        unitCost: parsed.unitCost.toFixed(2),
        referenceType: 'opening',
        referenceId: product.id,
        memo: 'Opening stock',
        movementDate: new Date().toISOString().slice(0, 10),
      });
    }

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CREATE',
      tableName: 'inventory_products',
      recordId: product.id,
      newValues: { sku: parsed.sku, name: parsed.name },
      notes: 'Created product.',
    });
  });

  revalidatePath('/inventory/products');
  const { redirect } = await import('next/navigation');
  redirect('/inventory/products');
}

export interface StockDocRow {
  id: string;
  docType: string;
  documentNumber: string;
  docDate: string;
  status: string;
  reason: string | null;
  lineCount: number;
}

export async function listStockDocs(docType: 'transfer' | 'adjustment'): Promise<StockDocRow[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: inventoryStockDocs.id,
        docType: inventoryStockDocs.docType,
        documentNumber: inventoryStockDocs.documentNumber,
        docDate: inventoryStockDocs.docDate,
        status: inventoryStockDocs.status,
        reason: inventoryStockDocs.reason,
        lineCount: sql<number>`(select count(*) from inventory_stock_doc_lines l where l.stock_doc_id = ${inventoryStockDocs.id})`,
      })
      .from(inventoryStockDocs)
      .where(
        and(
          eq(inventoryStockDocs.tenantId, user.tenantId),
          eq(inventoryStockDocs.docType, docType),
          isNull(inventoryStockDocs.voidedAt),
        ),
      )
      .orderBy(desc(inventoryStockDocs.docDate), desc(inventoryStockDocs.createdAt));

    return rows.map((r) => ({
      id: r.id,
      docType: r.docType,
      documentNumber: r.documentNumber,
      docDate: r.docDate,
      status: r.status,
      reason: r.reason,
      lineCount: Number(r.lineCount ?? 0),
    }));
  });
}

export async function createStockDocFromForm(formData: FormData): Promise<void> {
  const docType = String(formData.get('docType') ?? 'adjustment') as 'transfer' | 'adjustment';
  const docDate = String(formData.get('docDate') ?? new Date().toISOString().slice(0, 10));
  const reason = String(formData.get('reason') ?? '');
  const notes = String(formData.get('notes') ?? '');
  const fromLocationId = String(formData.get('fromLocationId') ?? '') || null;
  const toLocationId = String(formData.get('toLocationId') ?? '') || null;
  const lineCount = Number(formData.get('lineCount') ?? 1);

  const lines: { productId: string; quantity: number }[] = [];
  for (let i = 0; i < lineCount; i++) {
    const productId = String(formData.get(`line_${i}_productId`) ?? '');
    const quantity = Number(String(formData.get(`line_${i}_quantity`) ?? '0').replace(/[^0-9.-]/g, ''));
    if (productId && quantity) lines.push({ productId, quantity });
  }
  if (lines.length === 0) throw new Error('Add at least one product line.');

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    if (docType === 'adjustment') await assertOpenPeriod(user.tenantId, docDate);

    const prefix = docType === 'transfer' ? 'TRF' : 'ADJ';
    const compact = docDate.replace(/-/g, '');
    const [{ total }] = await db()
      .select({ total: sql<number>`count(*)` })
      .from(inventoryStockDocs)
      .where(
        and(
          eq(inventoryStockDocs.tenantId, user.tenantId),
          eq(inventoryStockDocs.docType, docType),
          isNull(inventoryStockDocs.voidedAt),
        ),
      );
    const documentNumber = `${prefix}-${compact}-${String(Number(total ?? 0) + 1).padStart(4, '0')}`;

    let transactionId: string | null = null;

    if (docType === 'adjustment') {
      // Aggregate GL lines across products
      const postingLines = [];
      for (const line of lines) {
        const [product] = await db()
          .select()
          .from(inventoryProducts)
          .where(and(eq(inventoryProducts.id, line.productId), eq(inventoryProducts.tenantId, user.tenantId)))
          .limit(1);
        if (!product) continue;
        const built = buildStockAdjustmentPosting({
          quantityDelta: line.quantity,
          unitCost: Number(product.unitCost),
          memo: `${documentNumber} ${product.name}`,
        });
        postingLines.push(...built);
      }

      if (postingLines.length > 0) {
        const accountMap = new Map<string, string>();
        for (const pl of postingLines) {
          if (!accountMap.has(pl.accountCode)) {
            const acc = await resolveAccount(user.tenantId, pl.accountCode);
            accountMap.set(pl.accountCode, acc.id);
          }
        }
        const paymentAccount = await resolveAccount(user.tenantId, '5100');
        const amount = postingLines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0);

        const [tx] = await db()
          .insert(transactions)
          .values({
            tenantId: user.tenantId,
            userId: user.id,
            accountingType: 'adjustment',
            direction: 'move_money',
            party: 'Inventory',
            description: documentNumber,
            amount: amount.toFixed(2),
            currency: 'LKR',
            paymentMethod: 'Other',
            paymentAccountId: paymentAccount.id,
            date: docDate,
            categoryCode: '5100',
            categoryName: 'Inventory',
            categoryConfidence: '1.00',
            categorySource: 'inventory',
            isAlreadySettled: '1',
            notes: reason || notes || null,
          })
          .returning({ id: transactions.id });
        transactionId = tx.id;

        const [journal] = await db()
          .insert(journalEntries)
          .values({
            tenantId: user.tenantId,
            userId: user.id,
            transactionId: tx.id,
            memo: documentNumber,
            entryDate: docDate,
            isBalanced: '1',
          })
          .returning({ id: journalEntries.id });

        await db().insert(journalLines).values(
          postingLines.map((pl) => ({
            tenantId: user.tenantId,
            journalEntryId: journal.id,
            accountId: accountMap.get(pl.accountCode)!,
            side: pl.side,
            amount: pl.amount.toFixed(2),
            memo: pl.memo,
          })),
        );
      }
    }

    const [doc] = await db()
      .insert(inventoryStockDocs)
      .values({
        tenantId: user.tenantId,
        userId: user.id,
        docType,
        documentNumber,
        docDate,
        status: 'posted',
        fromLocationId,
        toLocationId,
        reason: reason || null,
        notes: notes || null,
        transactionId,
      })
      .returning({ id: inventoryStockDocs.id });

    for (const line of lines) {
      const [product] = await db()
        .select()
        .from(inventoryProducts)
        .where(eq(inventoryProducts.id, line.productId))
        .limit(1);
      const unitCost = Number(product?.unitCost ?? 0);

      await db().insert(inventoryStockDocLines).values({
        tenantId: user.tenantId,
        stockDocId: doc.id,
        productId: line.productId,
        quantity: line.quantity.toFixed(4),
        unitCost: unitCost.toFixed(2),
      });

      if (docType === 'transfer') {
        // decrease from (null default) / increase to
        await applyQtyDelta(user.tenantId, line.productId, -Math.abs(line.quantity), fromLocationId);
        await applyQtyDelta(user.tenantId, line.productId, Math.abs(line.quantity), toLocationId);
        await db().insert(inventoryMovements).values({
          tenantId: user.tenantId,
          userId: user.id,
          movementType: 'transfer',
          productId: line.productId,
          quantity: Math.abs(line.quantity).toFixed(4),
          unitCost: unitCost.toFixed(2),
          fromLocationId,
          toLocationId,
          referenceType: 'stock_doc',
          referenceId: doc.id,
          memo: documentNumber,
          movementDate: docDate,
        });
      } else {
        await applyQtyDelta(user.tenantId, line.productId, line.quantity, null);
        await db().insert(inventoryMovements).values({
          tenantId: user.tenantId,
          userId: user.id,
          movementType: 'adjustment',
          productId: line.productId,
          quantity: line.quantity.toFixed(4),
          unitCost: unitCost.toFixed(2),
          referenceType: 'stock_doc',
          referenceId: doc.id,
          transactionId,
          memo: documentNumber,
          movementDate: docDate,
        });
      }
    }

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CREATE',
      tableName: 'inventory_stock_docs',
      recordId: doc.id,
      newValues: { documentNumber, docType },
      notes: docType === 'transfer' ? 'Stock transfer (no GL).' : 'Stock adjustment posted.',
    });
  });

  revalidatePath('/inventory/transfers');
  revalidatePath('/inventory/adjustments');
  revalidatePath('/inventory/products');
  revalidatePath('/journal');
  const { redirect } = await import('next/navigation');
  redirect(docType === 'transfer' ? '/inventory/transfers' : '/inventory/adjustments');
}

async function applyQtyDelta(
  tenantId: string,
  productId: string,
  delta: number,
  locationId: string | null,
) {
  const [level] = await db()
    .select()
    .from(inventoryStockLevels)
    .where(
      and(
        eq(inventoryStockLevels.tenantId, tenantId),
        eq(inventoryStockLevels.productId, productId),
        locationId
          ? eq(inventoryStockLevels.locationId, locationId)
          : sql`${inventoryStockLevels.locationId} is null`,
      ),
    )
    .limit(1);

  if (level) {
    await db()
      .update(inventoryStockLevels)
      .set({
        qtyOnHand: (Number(level.qtyOnHand) + delta).toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(inventoryStockLevels.id, level.id));
  } else {
    await db().insert(inventoryStockLevels).values({
      tenantId,
      productId,
      locationId,
      qtyOnHand: delta.toFixed(4),
    });
  }
}
