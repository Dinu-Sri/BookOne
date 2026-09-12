import {
  and,
  db,
  eq,
  inventoryCostLayerConsumptions,
  inventoryCostLayers,
  inventoryProducts,
  inventoryStockLevels,
  isNull,
  sql,
} from '@bookone/db';

export type CostingMethod = 'last' | 'average' | 'fifo';

export function parseCostingMethod(raw: string | null | undefined): CostingMethod {
  if (raw === 'average') return 'average';
  if (raw === 'fifo') return 'fifo';
  return 'last';
}

export function productUsesLots(productType: string | null | undefined): boolean {
  const t = String(productType ?? '');
  return t === 'physical' || t === 'stocked' || t === 'rental';
}

export type LotSlice = { layerId: string | null; qty: number; unitCost: number };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function locationWhere(locationId: string | null) {
  return locationId
    ? eq(inventoryCostLayers.locationId, locationId)
    : sql`${inventoryCostLayers.locationId} is null`;
}

async function openLayers(tenantId: string, productId: string, locationId: string | null) {
  return db()
    .select()
    .from(inventoryCostLayers)
    .where(
      and(
        eq(inventoryCostLayers.tenantId, tenantId),
        eq(inventoryCostLayers.productId, productId),
        locationWhere(locationId),
        isNull(inventoryCostLayers.voidedAt),
        sql`${inventoryCostLayers.qtyRemaining}::numeric > 0`,
      ),
    )
    .orderBy(inventoryCostLayers.receivedOn, inventoryCostLayers.createdAt, inventoryCostLayers.id);
}

/** If this SKU has stock but no open lots (legacy rows), seed one lot per location at current master cost. */
export async function seedLotsFromOnHand(tenantId: string, productId: string, date: string): Promise<void> {
  try {
    const [open] = await db()
      .select({ qty: sql<string>`coalesce(sum(${inventoryCostLayers.qtyRemaining}::numeric), 0)` })
      .from(inventoryCostLayers)
      .where(
        and(
          eq(inventoryCostLayers.tenantId, tenantId),
          eq(inventoryCostLayers.productId, productId),
          isNull(inventoryCostLayers.voidedAt),
        ),
      );
    if (Number(open?.qty ?? 0) > 0.0001) return;

    const [prod] = await db()
      .select({ unitCost: inventoryProducts.unitCost })
      .from(inventoryProducts)
      .where(eq(inventoryProducts.id, productId))
      .limit(1);
    const unitCost = round2(Number(prod?.unitCost ?? 0));

    const levels = await db()
      .select({
        locationId: inventoryStockLevels.locationId,
        qty: inventoryStockLevels.qtyOnHand,
      })
      .from(inventoryStockLevels)
      .where(and(eq(inventoryStockLevels.tenantId, tenantId), eq(inventoryStockLevels.productId, productId)));

    for (const row of levels) {
      const qty = round4(Number(row.qty ?? 0));
      if (qty <= 0.0001) continue;
      await db().insert(inventoryCostLayers).values({
        tenantId,
        productId,
        locationId: row.locationId ?? null,
        qtyReceived: qty.toFixed(4),
        qtyRemaining: qty.toFixed(4),
        unitCost: unitCost.toFixed(2),
        receivedOn: date,
        sourceType: 'opening_seed',
        sourceId: null,
      });
    }
  } catch {
    /* table may not exist until migration 034 */
  }
}

export async function receiveCostLayer(opts: {
  tenantId: string;
  productId: string;
  locationId: string | null;
  qty: number;
  unitCost: number;
  date: string;
  sourceType: string;
  sourceId: string | null;
}): Promise<void> {
  const qty = round4(opts.qty);
  if (qty <= 0.0001) return;
  try {
    await db().insert(inventoryCostLayers).values({
      tenantId: opts.tenantId,
      productId: opts.productId,
      locationId: opts.locationId,
      qtyReceived: qty.toFixed(4),
      qtyRemaining: qty.toFixed(4),
      unitCost: round2(Math.max(0, opts.unitCost)).toFixed(2),
      receivedOn: opts.date,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
    });
  } catch {
    /* 034 not applied */
  }
}

export async function consumeCostLayers(opts: {
  tenantId: string;
  productId: string;
  locationId: string | null;
  qty: number;
  date: string;
  sourceType: string;
  sourceId: string | null;
  fallbackUnitCost: number;
  blockNegative?: boolean;
}): Promise<{ unitCost: number; totalCost: number; slices: LotSlice[] }> {
  const need = round4(opts.qty);
  if (need <= 0.0001) return { unitCost: 0, totalCost: 0, slices: [] };

  try {
    await seedLotsFromOnHand(opts.tenantId, opts.productId, opts.date);

    const slices: LotSlice[] = [];
    let left = need;
    const queues = [opts.locationId];
    if (opts.locationId) queues.push(null);

    for (const loc of queues) {
      if (left <= 0.0001) break;
      const layers = await openLayers(opts.tenantId, opts.productId, loc);
      for (const layer of layers) {
        if (left <= 0.0001) break;
        const avail = round4(Number(layer.qtyRemaining));
        if (avail <= 0.0001) continue;
        const take = round4(Math.min(avail, left));
        const cost = round2(Number(layer.unitCost));
        await db()
          .update(inventoryCostLayers)
          .set({ qtyRemaining: (avail - take).toFixed(4), updatedAt: new Date() })
          .where(eq(inventoryCostLayers.id, layer.id));
        await db().insert(inventoryCostLayerConsumptions).values({
          tenantId: opts.tenantId,
          layerId: layer.id,
          productId: opts.productId,
          qty: take.toFixed(4),
          unitCost: cost.toFixed(2),
          sourceType: opts.sourceType,
          sourceId: opts.sourceId,
        });
        slices.push({ layerId: layer.id, qty: take, unitCost: cost });
        left = round4(left - take);
      }
    }

    if (left > 0.0001) {
      if (opts.blockNegative) {
        throw new Error(
          `Insufficient stock lots for this product (need ${need}, short ${left}). Receive the goods first or allow negative stock.`,
        );
      }
      slices.push({
        layerId: null,
        qty: left,
        unitCost: round2(Math.max(0, opts.fallbackUnitCost)),
      });
    }

    const totalCost = round2(slices.reduce((s, x) => s + x.qty * x.unitCost, 0));
    const unitCost = need > 0 ? round2(totalCost / need) : 0;
    return { unitCost, totalCost, slices };
  } catch (e) {
    if (opts.blockNegative && e instanceof Error && /Insufficient stock lots/.test(e.message)) throw e;
    return {
      unitCost: round2(Math.max(0, opts.fallbackUnitCost)),
      totalCost: round2(need * Math.max(0, opts.fallbackUnitCost)),
      slices: [{ layerId: null, qty: need, unitCost: round2(Math.max(0, opts.fallbackUnitCost)) }],
    };
  }
}

export async function transferCostLayers(opts: {
  tenantId: string;
  productId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  qty: number;
  date: string;
  sourceId: string | null;
  fallbackUnitCost: number;
  blockNegative?: boolean;
}): Promise<{ unitCost: number }> {
  const consumed = await consumeCostLayers({
    tenantId: opts.tenantId,
    productId: opts.productId,
    locationId: opts.fromLocationId,
    qty: opts.qty,
    date: opts.date,
    sourceType: 'transfer_out',
    sourceId: opts.sourceId,
    fallbackUnitCost: opts.fallbackUnitCost,
    blockNegative: opts.blockNegative,
  });
  for (const slice of consumed.slices) {
    await receiveCostLayer({
      tenantId: opts.tenantId,
      productId: opts.productId,
      locationId: opts.toLocationId,
      qty: slice.qty,
      unitCost: slice.unitCost,
      date: opts.date,
      sourceType: 'transfer_in',
      sourceId: opts.sourceId,
    });
  }
  return { unitCost: consumed.unitCost };
}

export async function syncFifoMasterCost(tenantId: string, productId: string): Promise<void> {
  try {
    const [row] = await db()
      .select({
        qty: sql<string>`coalesce(sum(${inventoryCostLayers.qtyRemaining}::numeric), 0)`,
        value: sql<string>`coalesce(sum(${inventoryCostLayers.qtyRemaining}::numeric * ${inventoryCostLayers.unitCost}::numeric), 0)`,
      })
      .from(inventoryCostLayers)
      .where(
        and(
          eq(inventoryCostLayers.tenantId, tenantId),
          eq(inventoryCostLayers.productId, productId),
          isNull(inventoryCostLayers.voidedAt),
          sql`${inventoryCostLayers.qtyRemaining}::numeric > 0`,
        ),
      );
    const qty = Number(row?.qty ?? 0);
    const value = Number(row?.value ?? 0);
    if (qty <= 0.0001) return;
    await db()
      .update(inventoryProducts)
      .set({ unitCost: round2(value / qty).toFixed(2), updatedAt: new Date() })
      .where(and(eq(inventoryProducts.id, productId), eq(inventoryProducts.tenantId, tenantId)));
  } catch {
    /* ignore */
  }
}

export async function seedAllProductLots(tenantId: string, date: string): Promise<void> {
  const products = await db()
    .select({ id: inventoryProducts.id, productType: inventoryProducts.productType })
    .from(inventoryProducts)
    .where(and(eq(inventoryProducts.tenantId, tenantId), isNull(inventoryProducts.voidedAt)));
  for (const p of products) {
    if (!productUsesLots(p.productType)) continue;
    await seedLotsFromOnHand(tenantId, p.id, date);
  }
}

export async function listOpenLots(tenantId: string, productId: string): Promise<
  { id: string; locationId: string | null; qtyRemaining: number; unitCost: number; receivedOn: string }[]
> {
  try {
    const rows = await db()
      .select({
        id: inventoryCostLayers.id,
        locationId: inventoryCostLayers.locationId,
        qtyRemaining: inventoryCostLayers.qtyRemaining,
        unitCost: inventoryCostLayers.unitCost,
        receivedOn: inventoryCostLayers.receivedOn,
      })
      .from(inventoryCostLayers)
      .where(
        and(
          eq(inventoryCostLayers.tenantId, tenantId),
          eq(inventoryCostLayers.productId, productId),
          isNull(inventoryCostLayers.voidedAt),
          sql`${inventoryCostLayers.qtyRemaining}::numeric > 0`,
        ),
      )
      .orderBy(inventoryCostLayers.receivedOn, inventoryCostLayers.createdAt);
    return rows.map((r) => ({
      id: r.id,
      locationId: r.locationId ?? null,
      qtyRemaining: Number(r.qtyRemaining),
      unitCost: Number(r.unitCost),
      receivedOn: r.receivedOn,
    }));
  } catch {
    return [];
  }
}
