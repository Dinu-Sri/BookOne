import { NextResponse } from 'next/server';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  db,
  eq,
  inventoryProducts,
  inventoryStockLevels,
  isNull,
  locations,
  withTenantContext,
} from '@bookone/db';
import { createQuickProduct } from '@/app/actions/inventory';
import { createCommercialDocument } from '@/app/actions/commercial-docs';

export const dynamic = 'force-dynamic';

function isAllowed(user: { role: string; email: string }) {
  return user.role === 'super_admin' || user.email === 'dinu.sri.m@gmail.com';
}

const DEMO_PRODUCTS = [
  { name: 'Banquet chair', sellPrice: 150, unitCost: 800, qty: 200 },
  { name: 'Round table 5ft', sellPrice: 800, unitCost: 4500, qty: 40 },
  { name: 'Pagoda tent 5x5', sellPrice: 15000, unitCost: 65000, qty: 4 },
] as const;

export async function POST() {
  try {
    const user = await requireTenantContext();
    if (!isAllowed(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const products: { id: string; sku: string; name: string; sellPrice: number }[] = [];
    for (const spec of DEMO_PRODUCTS) {
      const existing = await withTenantContext(user.tenantId, async () => {
        const [row] = await db()
          .select({
            id: inventoryProducts.id,
            sku: inventoryProducts.sku,
            name: inventoryProducts.name,
            sellPrice: inventoryProducts.sellPrice,
          })
          .from(inventoryProducts)
          .where(
            and(
              eq(inventoryProducts.tenantId, user.tenantId),
              eq(inventoryProducts.name, spec.name),
              isNull(inventoryProducts.voidedAt),
            ),
          )
          .limit(1);
        return row ?? null;
      });
      if (existing) {
        products.push({
          id: existing.id,
          sku: existing.sku,
          name: existing.name,
          sellPrice: Number(existing.sellPrice),
        });
        continue;
      }
      const created = await createQuickProduct({
        name: spec.name,
        productType: 'rental',
        sellPrice: spec.sellPrice,
        unitCost: spec.unitCost,
      });
      if (!created.ok || !created.product) {
        return NextResponse.json({ error: created.error ?? `Could not create ${spec.name}` }, { status: 500 });
      }
      products.push({
        id: created.product.id,
        sku: created.product.sku,
        name: created.product.name,
        sellPrice: created.product.sellPrice,
      });
    }

    const warehouse = await withTenantContext(user.tenantId, async () => {
      const rows = await db()
        .select({ id: locations.id, brandId: locations.brandId, name: locations.name, locationType: locations.locationType })
        .from(locations)
        .where(and(eq(locations.tenantId, user.tenantId), isNull(locations.voidedAt)));
      const operational = rows.filter(
        (l) => l.locationType !== 'on_rent' && l.locationType !== 'repair' && l.locationType !== 'wash',
      );
      return operational.find((l) => l.name === 'Panadura') ?? operational[0] ?? null;
    });

    if (warehouse) {
      await withTenantContext(user.tenantId, async () => {
        for (let i = 0; i < products.length; i++) {
          const qty = String(DEMO_PRODUCTS[i]!.qty);
          const [level] = await db()
            .select({ id: inventoryStockLevels.id })
            .from(inventoryStockLevels)
            .where(
              and(
                eq(inventoryStockLevels.tenantId, user.tenantId),
                eq(inventoryStockLevels.productId, products[i]!.id),
                eq(inventoryStockLevels.locationId, warehouse.id),
              ),
            )
            .limit(1);
          if (level) {
            await db()
              .update(inventoryStockLevels)
              .set({ qtyOnHand: qty, updatedAt: new Date() })
              .where(eq(inventoryStockLevels.id, level.id));
          } else {
            await db().insert(inventoryStockLevels).values({
              tenantId: user.tenantId,
              productId: products[i]!.id,
              locationId: warehouse.id,
              qtyOnHand: qty,
            });
          }
        }
      });
    }

    const invoice = await createCommercialDocument({
      documentType: 'sales_invoice',
      partyName: 'Garden Banquet',
      issueDate: new Date().toISOString().slice(0, 10),
      saleChannel: 'local',
      invoiceKind: 'commercial',
      paymentMode: 'Credit',
      brandId: warehouse?.brandId ?? null,
      locationId: warehouse?.id ?? null,
      eventDate: '2026-09-12',
      hireFrom: '2026-09-12',
      hireTo: '2026-09-13',
      venue: 'Waters Edge lawn',
      guestCount: 80,
      notes: 'Demo hire invoice for rental testing',
      lines: [
        {
          productId: products[0]!.id,
          description: products[0]!.name,
          quantity: 80,
          unitPrice: products[0]!.sellPrice,
        },
        {
          productId: products[1]!.id,
          description: products[1]!.name,
          quantity: 10,
          unitPrice: products[1]!.sellPrice,
        },
        {
          productId: products[2]!.id,
          description: products[2]!.name,
          quantity: 1,
          unitPrice: products[2]!.sellPrice,
        },
      ],
    });

    if (!invoice.ok) {
      return NextResponse.json(
        { error: invoice.error ?? 'Invoice failed', products, warehouse: warehouse?.name ?? null },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      products,
      warehouse: warehouse ? { id: warehouse.id, name: warehouse.name } : null,
      invoice: { id: invoice.id },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Seed failed' },
      { status: 500 },
    );
  }
}
