'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  buildOpeningStockPosting,
  buildStockAdjustmentPosting,
  isPhysicalProduct,
} from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  auditLog,
  businessDocumentLines,
  businessDocuments,
  db,
  eq,
  and,
  isNull,
  desc,
  asc,
  sql,
  or,
  inventoryProducts,
  inventoryStockLevels,
  inventoryStockDocs,
  inventoryStockDocLines,
  inventoryMovements,
  journalEntries,
  journalLines,
  periodLocks,
  transactions,
  locations,
  withTenantContext,
} from '@bookone/db';

const productTypeSchema = z.enum(['physical', 'digital', 'service', 'stocked']);

const productInputSchema = z.object({
  sku: z.string().min(1).max(80),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  productType: productTypeSchema.default('physical'),
  unit: z.string().max(40).default('ea'),
  unitCost: z.number().min(0).default(0),
  sellPrice: z.number().min(0).default(0),
  openingQty: z.number().default(0),
  category: z.string().max(120).optional(),
  barcode: z.string().max(80).optional(),
  sellable: z.boolean().default(true),
  purchasable: z.boolean().default(true),
  taxStatus: z.enum(['standard', 'exempt', 'unknown']).default('unknown'),
  reorderLevel: z.number().min(0).optional().nullable(),
  reorderQty: z.number().min(0).optional().nullable(),
  revenueAccountCode: z.string().max(20).default('4000'),
  cogsAccountCode: z.string().max(20).default('5000'),
  inventoryAccountCode: z.string().max(20).default('5100'),
  expenseAccountCode: z.string().max(20).default('6800'),
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().default(true),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  productType: string;
  unit: string;
  unitCost: number;
  sellPrice: number;
  qtyOnHand: number;
  isActive: string;
  category: string | null;
  barcode: string | null;
  sellable: boolean;
  purchasable: boolean;
  taxStatus: string;
  reorderLevel: number | null;
  reorderQty: number | null;
  revenueAccountCode: string;
  cogsAccountCode: string;
  inventoryAccountCode: string;
  expenseAccountCode: string;
  notes: string | null;
  imageKey: string | null;
  /** Browser-ready URL (public path or signed S3 URL) */
  imageUrl: string | null;
  movementCount: number;
  documentLineCount: number;
  canDelete: boolean;
  deleteReasons: string[];
  typeLocked: boolean;
}

export interface StockLevelRow {
  id: string;
  productId: string;
  sku: string;
  name: string;
  locationId: string | null;
  locationName: string;
  qtyOnHand: number;
  unitCost: number;
  stockValue: number;
  reorderLevel: number | null;
  belowReorder: boolean;
}

export interface StockMovementRow {
  id: string;
  movementDate: string;
  movementType: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  fromLocationId: string | null;
  toLocationId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  memo: string | null;
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

function clean(v?: string | null) {
  const t = v?.trim();
  return t ? t : null;
}

function normalizeType(t: string): 'physical' | 'digital' | 'service' {
  if (t === 'stocked' || t === 'physical') return 'physical';
  if (t === 'digital') return 'digital';
  return 'service';
}

function revalidateInventory() {
  revalidatePath('/inventory/products');
  revalidatePath('/inventory/levels');
  revalidatePath('/inventory/ledger');
  revalidatePath('/inventory/transfers');
  revalidatePath('/inventory/adjustments');
  revalidatePath('/sales/invoices');
  revalidatePath('/purchase/purchases');
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

async function applyQtyDelta(
  tenantId: string,
  productId: string,
  delta: number,
  locationId: string | null,
  opts?: { blockNegative?: boolean },
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

  const current = Number(level?.qtyOnHand ?? 0);
  const next = current + delta;
  if (opts?.blockNegative && delta < 0 && next < -0.00005) {
    const [prod] = await db()
      .select({ sku: inventoryProducts.sku, name: inventoryProducts.name })
      .from(inventoryProducts)
      .where(eq(inventoryProducts.id, productId))
      .limit(1);
    const label = prod ? `${prod.sku} ${prod.name}` : productId;
    throw new Error(
      `Insufficient stock for ${label}: on hand ${current.toFixed(4)}, need ${Math.abs(delta).toFixed(4)}. Allow negative stock in Inventory Settings or adjust levels.`,
    );
  }

  if (level) {
    await db()
      .update(inventoryStockLevels)
      .set({
        qtyOnHand: next.toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(inventoryStockLevels.id, level.id));
  } else {
    await db().insert(inventoryStockLevels).values({
      tenantId,
      productId,
      locationId,
      qtyOnHand: next.toFixed(4),
    });
  }
}

function mapProduct(
  row: Record<string, unknown>,
  extras: Partial<
    Pick<
      ProductRow,
      | 'qtyOnHand'
      | 'movementCount'
      | 'documentLineCount'
      | 'canDelete'
      | 'deleteReasons'
      | 'typeLocked'
      | 'imageUrl'
    >
  >,
): ProductRow {
  const type = normalizeType(String(row.productType ?? 'physical'));
  return {
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    productType: type,
    unit: String(row.unit ?? 'ea'),
    unitCost: Number(row.unitCost ?? 0),
    sellPrice: Number(row.sellPrice ?? 0),
    qtyOnHand: extras.qtyOnHand ?? 0,
    isActive: String(row.isActive ?? '1'),
    category: (row.category as string | null) ?? null,
    barcode: (row.barcode as string | null) ?? null,
    sellable: row.sellable !== '0' && row.sellable !== false,
    purchasable: row.purchasable !== '0' && row.purchasable !== false,
    taxStatus: String(row.taxStatus ?? 'unknown'),
    reorderLevel: row.reorderLevel != null ? Number(row.reorderLevel) : null,
    reorderQty: row.reorderQty != null ? Number(row.reorderQty) : null,
    revenueAccountCode: String(row.revenueAccountCode ?? '4000'),
    cogsAccountCode: String(row.cogsAccountCode ?? '5000'),
    inventoryAccountCode: String(row.inventoryAccountCode ?? '5100'),
    expenseAccountCode: String(row.expenseAccountCode ?? '6800'),
    notes: (row.notes as string | null) ?? null,
    imageKey: (row.imageKey as string | null) ?? null,
    imageUrl: extras.imageUrl ?? null,
    movementCount: extras.movementCount ?? 0,
    documentLineCount: extras.documentLineCount ?? 0,
    canDelete: extras.canDelete ?? false,
    deleteReasons: extras.deleteReasons ?? [],
    typeLocked: extras.typeLocked ?? false,
  };
}

export async function listProducts(filter?: {
  q?: string;
  productType?: string;
  status?: 'active' | 'inactive' | 'all';
  sort?: 'name' | 'sku' | 'type' | 'qty' | 'price';
  dir?: 'asc' | 'desc';
  physicalOnly?: boolean;
}): Promise<ProductRow[]> {
  const user = await requireTenantContext();
  const q = filter?.q?.trim() ?? '';
  // Default 'all' so newly seeded demos and archived items remain discoverable via search
  // when explicitly filtered; product list page passes status as needed.
  const status = filter?.status ?? 'active';
  const sort = filter?.sort ?? 'name';
  const dir = filter?.dir ?? 'asc';

  return withTenantContext(user.tenantId, async () => {
    const conditions = [eq(inventoryProducts.tenantId, user.tenantId), isNull(inventoryProducts.voidedAt)];
    if (status === 'active') conditions.push(eq(inventoryProducts.isActive, '1'));
    if (status === 'inactive') conditions.push(eq(inventoryProducts.isActive, '0'));
    if (filter?.productType && filter.productType !== 'all') {
      if (filter.productType === 'physical') {
        conditions.push(or(eq(inventoryProducts.productType, 'physical'), eq(inventoryProducts.productType, 'stocked'))!);
      } else {
        conditions.push(eq(inventoryProducts.productType, filter.productType));
      }
    }
    if (filter?.physicalOnly) {
      conditions.push(or(eq(inventoryProducts.productType, 'physical'), eq(inventoryProducts.productType, 'stocked'))!);
    }
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      conditions.push(
        sql`(
          lower(${inventoryProducts.name}) like ${like}
          or lower(${inventoryProducts.sku}) like ${like}
          or lower(coalesce(${inventoryProducts.category}, '')) like ${like}
          or lower(coalesce(${inventoryProducts.barcode}, '')) like ${like}
        )`,
      );
    }

    const orderCol =
      sort === 'sku'
        ? inventoryProducts.sku
        : sort === 'type'
          ? inventoryProducts.productType
          : sort === 'price'
            ? inventoryProducts.sellPrice
            : inventoryProducts.name;

    const rows = await db()
      .select()
      .from(inventoryProducts)
      .where(and(...conditions))
      .orderBy(dir === 'desc' ? desc(orderCol) : asc(orderCol));

    const qtyRows = await db()
      .select({
        productId: inventoryStockLevels.productId,
        qty: sql<string>`coalesce(sum(${inventoryStockLevels.qtyOnHand}::numeric), 0)`,
      })
      .from(inventoryStockLevels)
      .where(eq(inventoryStockLevels.tenantId, user.tenantId))
      .groupBy(inventoryStockLevels.productId);
    const qtyMap = new Map(qtyRows.map((r) => [r.productId, Number(r.qty)]));

    const movRows = await db()
      .select({
        productId: inventoryMovements.productId,
        total: sql<number>`count(*)`,
      })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.tenantId, user.tenantId))
      .groupBy(inventoryMovements.productId);
    const movMap = new Map(movRows.map((r) => [r.productId, Number(r.total)]));

    const lineRows = await db()
      .select({
        productId: businessDocumentLines.productId,
        total: sql<number>`count(*)`,
      })
      .from(businessDocumentLines)
      .where(and(eq(businessDocumentLines.tenantId, user.tenantId), isNull(businessDocumentLines.voidedAt)))
      .groupBy(businessDocumentLines.productId);
    const lineMap = new Map(
      lineRows.filter((r) => r.productId).map((r) => [r.productId as string, Number(r.total)]),
    );

    const { resolveProductImageUrl } = await import('@/lib/product-image');

    let result = await Promise.all(
      rows.map(async (row) => {
        const mov = movMap.get(row.id) ?? 0;
        const docs = lineMap.get(row.id) ?? 0;
        const qty = qtyMap.get(row.id) ?? 0;
        const reasons: string[] = [];
        if (mov > 0) reasons.push(`Has ${mov} stock movement(s).`);
        if (docs > 0) reasons.push(`Used on ${docs} document line(s).`);
        if (Math.abs(qty) > 0.0001) reasons.push(`Qty on hand is ${qty} (adjust to zero first).`);
        const imageUrl = await resolveProductImageUrl(row.imageKey);
        return mapProduct(row as unknown as Record<string, unknown>, {
          qtyOnHand: qty,
          movementCount: mov,
          documentLineCount: docs,
          canDelete: reasons.length === 0,
          deleteReasons: reasons,
          typeLocked: mov > 0 || docs > 0,
          imageUrl,
        });
      }),
    );

    if (sort === 'qty') {
      result.sort((a, b) => (dir === 'desc' ? b.qtyOnHand - a.qtyOnHand : a.qtyOnHand - b.qtyOnHand));
    }

    return result;
  });
}

export async function getProduct(id: string): Promise<ProductRow | null> {
  const rows = await listProducts({ status: 'all' });
  return rows.find((r) => r.id === id) ?? null;
}

export async function listPhysicalProductOptions(): Promise<
  { id: string; sku: string; name: string; unitCost: number; sellPrice: number; qtyOnHand: number }[]
> {
  const rows = await listProducts({ physicalOnly: true, status: 'active' });
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    unitCost: r.unitCost,
    sellPrice: r.sellPrice,
    qtyOnHand: r.qtyOnHand,
  }));
}

function formToProductInput(formData: FormData): ProductInput {
  return {
    sku: String(formData.get('sku') ?? ''),
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    productType: (String(formData.get('productType') ?? 'physical') as ProductInput['productType']) || 'physical',
    unit: String(formData.get('unit') ?? 'ea'),
    unitCost: Number(String(formData.get('unitCost') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
    sellPrice: Number(String(formData.get('sellPrice') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
    openingQty: Number(String(formData.get('openingQty') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
    category: String(formData.get('category') ?? ''),
    barcode: String(formData.get('barcode') ?? ''),
    sellable: formData.get('sellable') === 'on' || formData.get('sellable') === '1' || formData.get('sellable') === 'true',
    purchasable:
      formData.get('purchasable') === 'on' ||
      formData.get('purchasable') === '1' ||
      formData.get('purchasable') === 'true',
    taxStatus: (String(formData.get('taxStatus') ?? 'unknown') as ProductInput['taxStatus']) || 'unknown',
    reorderLevel: String(formData.get('reorderLevel') ?? '')
      ? Number(String(formData.get('reorderLevel')).replace(/[^0-9.-]/g, ''))
      : null,
    reorderQty: String(formData.get('reorderQty') ?? '')
      ? Number(String(formData.get('reorderQty')).replace(/[^0-9.-]/g, ''))
      : null,
    revenueAccountCode: String(formData.get('revenueAccountCode') ?? '4000') || '4000',
    cogsAccountCode: String(formData.get('cogsAccountCode') ?? '5000') || '5000',
    inventoryAccountCode: String(formData.get('inventoryAccountCode') ?? '5100') || '5100',
    expenseAccountCode: String(formData.get('expenseAccountCode') ?? '6800') || '6800',
    notes: String(formData.get('notes') ?? ''),
    isActive: formData.get('isActive') !== '0' && formData.get('status') !== 'inactive',
  };
}

function toProductValues(tenantId: string, parsed: ProductInput) {
  const type = normalizeType(parsed.productType);
  return {
    tenantId,
    sku: parsed.sku.trim(),
    name: parsed.name.trim(),
    description: clean(parsed.description),
    productType: type,
    unit: parsed.unit || 'ea',
    unitCost: parsed.unitCost.toFixed(2),
    sellPrice: parsed.sellPrice.toFixed(2),
    category: clean(parsed.category),
    barcode: clean(parsed.barcode),
    sellable: parsed.sellable ? '1' : '0',
    purchasable: parsed.purchasable ? '1' : '0',
    taxStatus: parsed.taxStatus,
    reorderLevel: type === 'physical' && parsed.reorderLevel != null ? parsed.reorderLevel.toFixed(4) : null,
    reorderQty: type === 'physical' && parsed.reorderQty != null ? parsed.reorderQty.toFixed(4) : null,
    revenueAccountCode: parsed.revenueAccountCode || '4000',
    cogsAccountCode: parsed.cogsAccountCode || '5000',
    inventoryAccountCode: parsed.inventoryAccountCode || '5100',
    expenseAccountCode: parsed.expenseAccountCode || '6800',
    notes: clean(parsed.notes),
    isActive: parsed.isActive ? '1' : '0',
    updatedAt: new Date(),
  };
}

/**
 * Quick-create product from free-text sales lines (quote/SO/invoice).
 * Default type: service. Returns product pick fields for linking the line.
 */
export async function createQuickProduct(input: {
  name: string;
  productType?: 'physical' | 'digital' | 'service';
  sellPrice?: number;
  unitCost?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    sellPrice: number;
    unitCost: number;
    productType: string;
    barcode: string | null;
    imageUrl: string | null;
  };
}> {
  try {
    const name = input.name.trim();
    if (!name) return { ok: false, error: 'Name is required.' };
    const type = normalizeType(input.productType ?? 'service');
    const sellPrice = Math.max(0, Number(input.sellPrice) || 0);
    const unitCost = Math.max(0, Number(input.unitCost) || 0);
    const user = await requireTenantContext();

    const product = await withTenantContext(user.tenantId, async () => {
      const base = name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 12);
      const stamp = Date.now().toString(36).toUpperCase().slice(-4);
      let sku = `Q-${base || 'ITEM'}-${stamp}`.slice(0, 40);

      for (let i = 0; i < 5; i++) {
        const trySku = i === 0 ? sku : `${sku.slice(0, 36)}-${i}`;
        const [dup] = await db()
          .select({ id: inventoryProducts.id })
          .from(inventoryProducts)
          .where(
            and(
              eq(inventoryProducts.tenantId, user.tenantId),
              sql`lower(${inventoryProducts.sku}) = lower(${trySku})`,
              isNull(inventoryProducts.voidedAt),
            ),
          )
          .limit(1);
        if (!dup) {
          sku = trySku;
          break;
        }
      }

      const [created] = await db()
        .insert(inventoryProducts)
        .values(
          toProductValues(user.tenantId, {
            sku,
            name,
            description: name,
            productType: type,
            unit: 'ea',
            unitCost,
            sellPrice,
            openingQty: 0,
            category: type === 'service' ? 'Services' : type === 'digital' ? 'Digital' : 'General',
            barcode: '',
            sellable: true,
            purchasable: type === 'physical',
            taxStatus: 'standard',
            reorderLevel: null,
            reorderQty: null,
            revenueAccountCode: '4000',
            cogsAccountCode: '5000',
            inventoryAccountCode: '5100',
            expenseAccountCode: '6800',
            notes: 'Quick-created from sales document free-text line',
            isActive: true,
          }),
        )
        .returning({
          id: inventoryProducts.id,
          sku: inventoryProducts.sku,
          name: inventoryProducts.name,
          sellPrice: inventoryProducts.sellPrice,
          unitCost: inventoryProducts.unitCost,
          productType: inventoryProducts.productType,
        });

      if (type === 'physical') {
        await db().insert(inventoryStockLevels).values({
          tenantId: user.tenantId,
          productId: created.id,
          locationId: null,
          qtyOnHand: '0',
        });
      }

      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'CREATE',
        tableName: 'inventory_products',
        recordId: created.id,
        newValues: { sku: created.sku, name: created.name, productType: type, source: 'quick' },
        notes: 'Quick-created product from free-text line.',
      });

      return created;
    });

    revalidatePath('/inventory/products');
    revalidatePath('/sales/quotations');
    revalidatePath('/sales/orders');
    revalidatePath('/sales/invoices');
    revalidatePath('/pos');

    return {
      ok: true,
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        sellPrice: Number(product.sellPrice),
        unitCost: Number(product.unitCost),
        productType: product.productType,
        barcode: null,
        imageUrl: null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create product.' };
  }
}

export async function createProductFromForm(formData: FormData): Promise<void> {
  const parsed = productInputSchema.parse(formToProductInput(formData));
  const type = normalizeType(parsed.productType);
  const user = await requireTenantContext();

  await withTenantContext(user.tenantId, async () => {
    const [dup] = await db()
      .select({ id: inventoryProducts.id })
      .from(inventoryProducts)
      .where(
        and(
          eq(inventoryProducts.tenantId, user.tenantId),
          sql`lower(${inventoryProducts.sku}) = lower(${parsed.sku.trim()})`,
          isNull(inventoryProducts.voidedAt),
        ),
      )
      .limit(1);
    if (dup) throw new Error('SKU already exists.');

    const [product] = await db()
      .insert(inventoryProducts)
      .values(toProductValues(user.tenantId, { ...parsed, productType: type }))
      .returning({ id: inventoryProducts.id });

    const photo = formData.get('photo');
    if (photo instanceof File && photo.size > 0) {
      const { saveProductPhoto } = await import('@/lib/product-image');
      const { imageKey } = await saveProductPhoto({
        tenantId: user.tenantId,
        productId: product.id,
        file: photo,
      });
      await db()
        .update(inventoryProducts)
        .set({ imageKey, updatedAt: new Date() })
        .where(eq(inventoryProducts.id, product.id));
    }

    if (type === 'physical') {
      await db().insert(inventoryStockLevels).values({
        tenantId: user.tenantId,
        productId: product.id,
        locationId: null,
        qtyOnHand: parsed.openingQty.toFixed(4),
      });
      if (parsed.openingQty > 0) {
        const openDate = new Date().toISOString().slice(0, 10);
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
          movementDate: openDate,
        });

        // P0: capitalise opening inventory (Dr 5100 / Cr Owner Equity 3000)
        const glLines = buildOpeningStockPosting({
          quantity: parsed.openingQty,
          unitCost: parsed.unitCost,
          memo: `Opening stock ${parsed.sku}`,
        });
        if (glLines.length > 0) {
          const accountMap = new Map<string, string>();
          for (const pl of glLines) {
            if (!accountMap.has(pl.accountCode)) {
              const [acc] = await db()
                .select({ id: accounts.id })
                .from(accounts)
                .where(
                  and(
                    eq(accounts.tenantId, user.tenantId),
                    eq(accounts.code, pl.accountCode),
                    isNull(accounts.voidedAt),
                  ),
                )
                .limit(1);
              if (!acc) throw new Error(`Account ${pl.accountCode} not found for opening stock.`);
              accountMap.set(pl.accountCode, acc.id);
            }
          }
          const amount = Math.round(parsed.openingQty * parsed.unitCost * 100) / 100;
          const [txRow] = await db()
            .insert(transactions)
            .values({
              tenantId: user.tenantId,
              userId: user.id,
              accountingType: 'adjustment',
              direction: 'move_money',
              party: 'Opening balance',
              description: `Opening stock ${parsed.sku} ${parsed.name}`.slice(0, 1000),
              amount: amount.toFixed(2),
              currency: 'LKR',
              paymentMethod: 'Credit',
              paymentAccountId: accountMap.get('5100')!,
              date: openDate,
              categoryCode: '5100',
              categoryName: 'Inventory',
              categoryConfidence: '1.00',
              categorySource: 'document',
              invoiceRef: parsed.sku,
              isAlreadySettled: '1',
              notes: 'Opening stock capitalisation',
            })
            .returning({ id: transactions.id });
          const [journal] = await db()
            .insert(journalEntries)
            .values({
              tenantId: user.tenantId,
              userId: user.id,
              transactionId: txRow.id,
              memo: `Opening stock ${parsed.sku}`,
              entryDate: openDate,
              isBalanced: '1',
            })
            .returning({ id: journalEntries.id });
          await db().insert(journalLines).values(
            glLines.map((pl) => ({
              tenantId: user.tenantId,
              journalEntryId: journal.id,
              accountId: accountMap.get(pl.accountCode)!,
              side: pl.side,
              amount: pl.amount.toFixed(2),
              memo: pl.memo,
            })),
          );
          await db()
            .update(inventoryMovements)
            .set({ transactionId: txRow.id })
            .where(
              and(
                eq(inventoryMovements.tenantId, user.tenantId),
                eq(inventoryMovements.productId, product.id),
                eq(inventoryMovements.referenceType, 'opening'),
                eq(inventoryMovements.referenceId, product.id),
              ),
            );
        }
      }
    }

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CREATE',
      tableName: 'inventory_products',
      recordId: product.id,
      newValues: { sku: parsed.sku, name: parsed.name, productType: type },
      notes: 'Created product.',
    });
  });

  revalidateInventory();
  const { redirect } = await import('next/navigation');
  redirect('/inventory/products?flash=created');
}

export async function updateProductFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Missing product id.');
  const parsed = productInputSchema.parse(formToProductInput(formData));
  const type = normalizeType(parsed.productType);
  const user = await requireTenantContext();

  await withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select()
      .from(inventoryProducts)
      .where(and(eq(inventoryProducts.tenantId, user.tenantId), eq(inventoryProducts.id, id), isNull(inventoryProducts.voidedAt)))
      .limit(1);
    if (!existing) throw new Error('Product not found.');

    const [mov] = await db()
      .select({ total: sql<number>`count(*)` })
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.tenantId, user.tenantId), eq(inventoryMovements.productId, id)));
    const movementCount = Number(mov?.total ?? 0);
    const prevType = normalizeType(existing.productType);
    if (movementCount > 0 && prevType !== type && (prevType === 'physical' || type === 'physical')) {
      throw new Error('Cannot change product type after stock movements exist.');
    }

    const values = toProductValues(user.tenantId, { ...parsed, productType: type });
    const photo = formData.get('photo');
    if (photo instanceof File && photo.size > 0) {
      const { saveProductPhoto } = await import('@/lib/product-image');
      const { imageKey } = await saveProductPhoto({
        tenantId: user.tenantId,
        productId: id,
        file: photo,
      });
      Object.assign(values, { imageKey });
    }

    await db().update(inventoryProducts).set(values).where(eq(inventoryProducts.id, id));

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'UPDATE',
      tableName: 'inventory_products',
      recordId: id,
      oldValues: { sku: existing.sku, productType: existing.productType },
      newValues: { sku: parsed.sku, productType: type },
      notes: 'Updated product.',
    });
  });

  revalidateInventory();
  const { redirect } = await import('next/navigation');
  redirect('/inventory/products?flash=updated');
}

export async function archiveProductFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    await db()
      .update(inventoryProducts)
      .set({ isActive: '0', updatedAt: new Date() })
      .where(and(eq(inventoryProducts.tenantId, user.tenantId), eq(inventoryProducts.id, id)));
  });
  revalidateInventory();
}

export async function restoreProductFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    await db()
      .update(inventoryProducts)
      .set({ isActive: '1', updatedAt: new Date() })
      .where(and(eq(inventoryProducts.tenantId, user.tenantId), eq(inventoryProducts.id, id)));
  });
  revalidateInventory();
}

export async function getProductDeleteBlockers(id: string): Promise<{ ok: boolean; reasons: string[] }> {
  const product = await getProduct(id);
  if (!product) return { ok: false, reasons: ['Product not found.'] };
  return { ok: product.canDelete, reasons: product.deleteReasons };
}

export async function deleteProductFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const blockers = await getProductDeleteBlockers(id);
    if (!blockers.ok) throw new Error(`Cannot delete: ${blockers.reasons.join(' ')}`);
    await db()
      .update(inventoryProducts)
      .set({ voidedAt: new Date(), isActive: '0', updatedAt: new Date() })
      .where(and(eq(inventoryProducts.tenantId, user.tenantId), eq(inventoryProducts.id, id)));
    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'DELETE',
      tableName: 'inventory_products',
      recordId: id,
      notes: 'Soft-voided product.',
    });
  });
  revalidateInventory();
}

export async function listStockLevels(filter?: { q?: string }): Promise<StockLevelRow[]> {
  const user = await requireTenantContext();
  const q = filter?.q?.trim().toLowerCase() ?? '';
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: inventoryStockLevels.id,
        productId: inventoryStockLevels.productId,
        sku: inventoryProducts.sku,
        name: inventoryProducts.name,
        locationId: inventoryStockLevels.locationId,
        locationName: locations.name,
        qtyOnHand: inventoryStockLevels.qtyOnHand,
        unitCost: inventoryProducts.unitCost,
        reorderLevel: inventoryProducts.reorderLevel,
        productType: inventoryProducts.productType,
      })
      .from(inventoryStockLevels)
      .innerJoin(inventoryProducts, eq(inventoryProducts.id, inventoryStockLevels.productId))
      .leftJoin(locations, eq(locations.id, inventoryStockLevels.locationId))
      .where(
        and(
          eq(inventoryStockLevels.tenantId, user.tenantId),
          isNull(inventoryProducts.voidedAt),
          or(eq(inventoryProducts.productType, 'physical'), eq(inventoryProducts.productType, 'stocked')),
        ),
      )
      .orderBy(asc(inventoryProducts.name));

    return rows
      .filter((r) => {
        if (!q) return true;
        return (
          r.sku.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.locationName ?? '').toLowerCase().includes(q)
        );
      })
      .map((r) => {
        const qty = Number(r.qtyOnHand);
        const cost = Number(r.unitCost);
        const reorder = r.reorderLevel != null ? Number(r.reorderLevel) : null;
        return {
          id: r.id,
          productId: r.productId,
          sku: r.sku,
          name: r.name,
          locationId: r.locationId,
          locationName: r.locationName ?? 'Default',
          qtyOnHand: qty,
          unitCost: cost,
          stockValue: Math.round(qty * cost * 100) / 100,
          reorderLevel: reorder,
          belowReorder: reorder != null && qty <= reorder,
        };
      });
  });
}

export async function listStockMovements(filter?: {
  q?: string;
  from?: string;
  to?: string;
  productId?: string;
}): Promise<StockMovementRow[]> {
  const user = await requireTenantContext();
  const q = filter?.q?.trim().toLowerCase() ?? '';
  return withTenantContext(user.tenantId, async () => {
    const conditions = [eq(inventoryMovements.tenantId, user.tenantId)];
    if (filter?.from) conditions.push(sql`${inventoryMovements.movementDate} >= ${filter.from}`);
    if (filter?.to) conditions.push(sql`${inventoryMovements.movementDate} <= ${filter.to}`);
    if (filter?.productId) conditions.push(eq(inventoryMovements.productId, filter.productId));

    const rows = await db()
      .select({
        id: inventoryMovements.id,
        movementDate: inventoryMovements.movementDate,
        movementType: inventoryMovements.movementType,
        productId: inventoryMovements.productId,
        sku: inventoryProducts.sku,
        productName: inventoryProducts.name,
        quantity: inventoryMovements.quantity,
        unitCost: inventoryMovements.unitCost,
        fromLocationId: inventoryMovements.fromLocationId,
        toLocationId: inventoryMovements.toLocationId,
        referenceType: inventoryMovements.referenceType,
        referenceId: inventoryMovements.referenceId,
        memo: inventoryMovements.memo,
      })
      .from(inventoryMovements)
      .innerJoin(inventoryProducts, eq(inventoryProducts.id, inventoryMovements.productId))
      .where(and(...conditions))
      .orderBy(desc(inventoryMovements.movementDate), desc(inventoryMovements.createdAt))
      .limit(500);

    return rows
      .filter((r) => {
        if (!q) return true;
        return (
          r.sku.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          (r.memo ?? '').toLowerCase().includes(q) ||
          r.movementType.toLowerCase().includes(q)
        );
      })
      .map((r) => ({
        id: r.id,
        movementDate: r.movementDate,
        movementType: r.movementType,
        productId: r.productId,
        sku: r.sku,
        productName: r.productName,
        quantity: Number(r.quantity),
        unitCost: Number(r.unitCost),
        fromLocationId: r.fromLocationId,
        toLocationId: r.toLocationId,
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        memo: r.memo,
      }));
  });
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
  if (lines.length === 0) throw new Error('Add at least one physical product line.');

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    if (docType === 'adjustment') await assertOpenPeriod(user.tenantId, docDate);

    for (const line of lines) {
      const [product] = await db()
        .select()
        .from(inventoryProducts)
        .where(eq(inventoryProducts.id, line.productId))
        .limit(1);
      if (!product || !isPhysicalProduct(product.productType)) {
        throw new Error('Only physical products can be transferred or adjusted.');
      }
    }

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
      const postingLines = [];
      for (const line of lines) {
        const [product] = await db()
          .select()
          .from(inventoryProducts)
          .where(eq(inventoryProducts.id, line.productId))
          .limit(1);
        if (!product) continue;
        postingLines.push(
          ...buildStockAdjustmentPosting({
            quantityDelta: line.quantity,
            unitCost: Number(product.unitCost),
            memo: `${documentNumber} ${product.name}`,
          }),
        );
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

    const { getInventorySettings } = await import('@/app/actions/inventory-settings');
    const invCfg = await getInventorySettings().catch(() => ({
      negativeStockPolicy: 'allow' as const,
    }));
    const blockNeg = invCfg.negativeStockPolicy === 'block';

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
        await applyQtyDelta(user.tenantId, line.productId, -Math.abs(line.quantity), fromLocationId, {
          blockNegative: blockNeg,
        });
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
        await applyQtyDelta(user.tenantId, line.productId, line.quantity, null, {
          blockNegative: blockNeg,
        });
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

  revalidateInventory();
  revalidatePath('/journal');
  const { redirect } = await import('next/navigation');
  redirect(docType === 'transfer' ? '/inventory/transfers?flash=created' : '/inventory/adjustments?flash=created');
}
