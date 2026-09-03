'use server';

import { availableQty, datesOverlap, isRentalProduct, padHireTo } from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  db,
  eq,
  inArray,
  isNull,
  inventoryProducts,
  inventoryStockLevels,
  locations,
  rentalBookingLines,
  rentalEvents,
  sql,
  withTenantContext,
} from '@bookone/db';
import { getRentalSettings, type OverlapPolicy } from '@/app/actions/rental-settings';

const ACTIVE_STATUSES = ['hold', 'reserved', 'dispatched'] as const;

export type RentalEventInput = {
  eventDate?: string | null;
  hireFrom?: string | null;
  hireTo?: string | null;
  venue?: string | null;
  guestCount?: number | null;
  deliverAt?: string | null;
  collectAt?: string | null;
  packingNotes?: string | null;
  confirmOverlap?: boolean;
  overlapOverrideReason?: string | null;
};

function isDate(v?: string | null): v is string {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

export function resolveHireWindow(input: RentalEventInput): { hireFrom: string; hireTo: string } | null {
  const from = input.hireFrom || input.deliverAt || input.eventDate || '';
  const to = input.hireTo || input.collectAt || input.eventDate || from;
  if (!isDate(from) || !isDate(to)) return null;
  return from <= to ? { hireFrom: from, hireTo: to } : { hireFrom: to, hireTo: from };
}

function bookingStatusForDoc(documentType: string): string {
  if (documentType === 'quotation') return 'hold';
  if (documentType === 'sales_invoice' || documentType === 'pos_sale') return 'reserved';
  return 'reserved';
}

function canOverrideOverlap(role: string): boolean {
  return role === 'super_admin' || role === 'owner' || role === 'admin';
}

export async function checkRentalAvailability(params: {
  tenantId: string;
  userRole: string;
  hireFrom: string;
  hireTo: string;
  lines: { productId: string; quantity: number }[];
  excludeDocumentId?: string | null;
  confirmOverlap?: boolean;
  overlapOverrideReason?: string | null;
}): Promise<void> {
  const settings = await getRentalSettings();
  await assertAvailability({
    tenantId: params.tenantId,
    userRole: params.userRole,
    locationId: null,
    hireFrom: params.hireFrom,
    hireTo: params.hireTo,
    lines: params.lines,
    excludeDocumentId: params.excludeDocumentId,
    policy: settings.overlapPolicy,
    confirmOverlap: Boolean(params.confirmOverlap),
    overrideReason: params.overlapOverrideReason,
    defaultTurnaroundHours: settings.defaultTurnaroundHours,
  });
}

export async function persistRentalBookings(params: {
  tenantId: string;
  userId: string;
  userRole: string;
  documentId: string;
  documentType: string;
  sourceDocumentId?: string | null;
  locationId?: string | null;
  event: RentalEventInput;
  lines: {
    documentLineId: string;
    productId: string | null;
    productType: string;
    quantity: number;
  }[];
  skipAvailabilityCheck?: boolean;
}): Promise<void> {
  const rentalLines = params.lines.filter((l) => l.productId && isRentalProduct(l.productType));
  const window = resolveHireWindow(params.event);

  if (rentalLines.length === 0) {
    if (params.sourceDocumentId) {
      await cancelBookingsForDocument(params.tenantId, params.sourceDocumentId);
    }
    return;
  }
  if (!window) {
    throw new Error(
      'Hire from and to dates are required when the document has rental products. Set the event period on the form.',
    );
  }

  const settings = await getRentalSettings();
  if (!params.skipAvailabilityCheck) {
    await assertAvailability({
      tenantId: params.tenantId,
      userRole: params.userRole,
      locationId: params.locationId ?? null,
      hireFrom: window.hireFrom,
      hireTo: window.hireTo,
      lines: rentalLines.map((l) => ({ productId: l.productId!, quantity: l.quantity })),
      excludeDocumentId: params.sourceDocumentId ?? params.documentId,
      policy: settings.overlapPolicy,
      confirmOverlap: Boolean(params.event.confirmOverlap),
      overrideReason: params.event.overlapOverrideReason,
      defaultTurnaroundHours: settings.defaultTurnaroundHours,
    });
  }

  const [existingEvent] = await db()
    .select({ id: rentalEvents.id })
    .from(rentalEvents)
    .where(and(eq(rentalEvents.tenantId, params.tenantId), eq(rentalEvents.documentId, params.documentId)))
    .limit(1);

  const eventValues = {
    eventDate: params.event.eventDate || window.hireFrom,
    hireFrom: window.hireFrom,
    hireTo: window.hireTo,
    venue: params.event.venue || null,
    guestCount: params.event.guestCount ?? null,
    deliverAt: params.event.deliverAt || window.hireFrom,
    collectAt: params.event.collectAt || window.hireTo,
    packingNotes: params.event.packingNotes || null,
    overlapOverrideReason: params.event.overlapOverrideReason || null,
    overlapOverriddenBy:
      params.event.confirmOverlap && canOverrideOverlap(params.userRole) ? params.userId : null,
    updatedAt: new Date(),
    voidedAt: null,
  };

  if (existingEvent) {
    await db().update(rentalEvents).set(eventValues).where(eq(rentalEvents.id, existingEvent.id));
  } else {
    await db().insert(rentalEvents).values({
      tenantId: params.tenantId,
      documentId: params.documentId,
      ...eventValues,
    });
  }

  await db()
    .update(rentalBookingLines)
    .set({ status: 'cancelled', voidedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(rentalBookingLines.tenantId, params.tenantId),
        eq(rentalBookingLines.documentId, params.documentId),
        isNull(rentalBookingLines.voidedAt),
      ),
    );

  const status = bookingStatusForDoc(params.documentType);
  for (const line of rentalLines) {
    const [product] = await db()
      .select({ turnaroundHours: inventoryProducts.turnaroundHours })
      .from(inventoryProducts)
      .where(eq(inventoryProducts.id, line.productId!))
      .limit(1);
    const hours =
      product?.turnaroundHours != null && product.turnaroundHours !== ''
        ? Number(product.turnaroundHours)
        : settings.defaultTurnaroundHours;
    const paddedTo = padHireTo(window.hireTo, Number.isFinite(hours) ? hours : 0);
    await db().insert(rentalBookingLines).values({
      tenantId: params.tenantId,
      documentId: params.documentId,
      documentLineId: line.documentLineId,
      productId: line.productId!,
      locationId: params.locationId ?? null,
      qty: line.quantity.toFixed(4),
      hireFrom: window.hireFrom,
      hireTo: paddedTo,
      status,
    });
  }

  if (params.sourceDocumentId && params.sourceDocumentId !== params.documentId) {
    await cancelBookingsForDocument(params.tenantId, params.sourceDocumentId);
  }
}

export async function cancelBookingsForDocument(tenantId: string, documentId: string): Promise<void> {
  await db()
    .update(rentalBookingLines)
    .set({ status: 'cancelled', voidedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(rentalBookingLines.tenantId, tenantId),
        eq(rentalBookingLines.documentId, documentId),
        isNull(rentalBookingLines.voidedAt),
      ),
    );
  await db()
    .update(rentalEvents)
    .set({ voidedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(rentalEvents.tenantId, tenantId), eq(rentalEvents.documentId, documentId), isNull(rentalEvents.voidedAt)),
    );
}

export async function loadRentalEventForDocument(
  tenantId: string,
  documentId: string,
): Promise<RentalEventInput | null> {
  const [row] = await db()
    .select()
    .from(rentalEvents)
    .where(
      and(eq(rentalEvents.tenantId, tenantId), eq(rentalEvents.documentId, documentId), isNull(rentalEvents.voidedAt)),
    )
    .limit(1);
  if (!row) return null;
  return {
    eventDate: row.eventDate,
    hireFrom: row.hireFrom,
    hireTo: row.hireTo,
    venue: row.venue,
    guestCount: row.guestCount,
    deliverAt: row.deliverAt,
    collectAt: row.collectAt,
    packingNotes: row.packingNotes,
  };
}

async function assertAvailability(params: {
  tenantId: string;
  userRole: string;
  locationId: string | null;
  hireFrom: string;
  hireTo: string;
  lines: { productId: string; quantity: number }[];
  excludeDocumentId?: string | null;
  policy: OverlapPolicy;
  confirmOverlap: boolean;
  overrideReason?: string | null;
  defaultTurnaroundHours: number;
}): Promise<void> {
  if (params.policy === 'allow') return;

  const shortages: string[] = [];
  for (const line of params.lines) {
    const owned = await fleetOwnedQty(params.tenantId, line.productId);
    const repair = await fleetRepairQty(params.tenantId, line.productId);
    const [product] = await db()
      .select({
        name: inventoryProducts.name,
        sku: inventoryProducts.sku,
        turnaroundHours: inventoryProducts.turnaroundHours,
      })
      .from(inventoryProducts)
      .where(eq(inventoryProducts.id, line.productId))
      .limit(1);
    const hours =
      product?.turnaroundHours != null && product.turnaroundHours !== ''
        ? Number(product.turnaroundHours)
        : params.defaultTurnaroundHours;
    const paddedTo = padHireTo(params.hireTo, Number.isFinite(hours) ? hours : 0);
    const committed = await committedQty({
      tenantId: params.tenantId,
      productId: line.productId,
      hireFrom: params.hireFrom,
      hireTo: paddedTo,
      excludeDocumentId: params.excludeDocumentId,
    });
    const free = availableQty({ ownedQty: owned, repairQty: repair, committedQty: committed });
    if (line.quantity > free + 0.0001) {
      shortages.push(
        `${product?.sku ?? line.productId} ${product?.name ?? ''}: need ${line.quantity}, available ${Math.max(0, free)} for ${params.hireFrom}–${params.hireTo}`.trim(),
      );
    }
  }

  if (shortages.length === 0) return;

  const detail = shortages.join('; ');
  if (params.policy === 'block') {
    throw new Error(`Hire overlap blocked. ${detail}`);
  }
  if (params.policy === 'override') {
    if (!params.confirmOverlap || !canOverrideOverlap(params.userRole)) {
      throw new Error(
        `Hire overlap — a manager must confirm with a reason. ${detail}`,
      );
    }
    if (!params.overrideReason?.trim()) {
      throw new Error(`Hire overlap override needs a reason. ${detail}`);
    }
    return;
  }
  // warn
  if (!params.confirmOverlap) {
    throw new Error(`Hire overlap warning — tick “Confirm overlap” to continue. ${detail}`);
  }
}

async function fleetOwnedQty(tenantId: string, productId: string): Promise<number> {
  const rows = await db()
    .select({
      qty: sql<string>`coalesce(sum(${inventoryStockLevels.qtyOnHand}::numeric), 0)`,
    })
    .from(inventoryStockLevels)
    .leftJoin(locations, eq(locations.id, inventoryStockLevels.locationId))
    .where(
      and(
        eq(inventoryStockLevels.tenantId, tenantId),
        eq(inventoryStockLevels.productId, productId),
        sql`(${inventoryStockLevels.locationId} is null or ${locations.locationType} not in ('on_rent','repair','wash'))`,
      ),
    );
  return Number(rows[0]?.qty ?? 0);
}

async function fleetRepairQty(tenantId: string, productId: string): Promise<number> {
  const rows = await db()
    .select({
      qty: sql<string>`coalesce(sum(${inventoryStockLevels.qtyOnHand}::numeric), 0)`,
    })
    .from(inventoryStockLevels)
    .innerJoin(locations, eq(locations.id, inventoryStockLevels.locationId))
    .where(
      and(
        eq(inventoryStockLevels.tenantId, tenantId),
        eq(inventoryStockLevels.productId, productId),
        eq(locations.locationType, 'repair'),
      ),
    );
  return Number(rows[0]?.qty ?? 0);
}

async function committedQty(params: {
  tenantId: string;
  productId: string;
  hireFrom: string;
  hireTo: string;
  excludeDocumentId?: string | null;
}): Promise<number> {
  const rows = await db()
    .select({
      qty: rentalBookingLines.qty,
      hireFrom: rentalBookingLines.hireFrom,
      hireTo: rentalBookingLines.hireTo,
      documentId: rentalBookingLines.documentId,
    })
    .from(rentalBookingLines)
    .where(
      and(
        eq(rentalBookingLines.tenantId, params.tenantId),
        eq(rentalBookingLines.productId, params.productId),
        inArray(rentalBookingLines.status, [...ACTIVE_STATUSES]),
        isNull(rentalBookingLines.voidedAt),
      ),
    );
  let sum = 0;
  for (const row of rows) {
    if (params.excludeDocumentId && row.documentId === params.excludeDocumentId) continue;
    if (datesOverlap(params.hireFrom, params.hireTo, row.hireFrom, row.hireTo)) {
      sum += Number(row.qty);
    }
  }
  return sum;
}

export async function listRentalCalendar(input: {
  from: string;
  to: string;
  productId?: string | null;
}): Promise<{
  events: {
    id: string;
    documentId: string;
    hireFrom: string;
    hireTo: string;
    eventDate: string | null;
    venue: string | null;
    guestCount: number | null;
    documentNumber: string;
    documentType: string;
    partyName: string;
    status: string;
  }[];
  bars: {
    id: string;
    productId: string;
    sku: string;
    productName: string;
    qty: number;
    hireFrom: string;
    hireTo: string;
    documentNumber: string;
    status: string;
  }[];
}> {
  const user = await requireTenantContext();
  const from = isDate(input.from) ? input.from : new Date().toISOString().slice(0, 8) + '01';
  const to = isDate(input.to) ? input.to : from;
  const { businessDocuments, parties } = await import('@bookone/db');

  return withTenantContext(user.tenantId, async () => {
    const eventRows = await db()
      .select({
        id: rentalEvents.id,
        documentId: rentalEvents.documentId,
        hireFrom: rentalEvents.hireFrom,
        hireTo: rentalEvents.hireTo,
        eventDate: rentalEvents.eventDate,
        venue: rentalEvents.venue,
        guestCount: rentalEvents.guestCount,
        documentNumber: businessDocuments.documentNumber,
        documentType: businessDocuments.documentType,
        partyName: parties.name,
        status: businessDocuments.status,
      })
      .from(rentalEvents)
      .innerJoin(businessDocuments, eq(businessDocuments.id, rentalEvents.documentId))
      .innerJoin(parties, eq(parties.id, businessDocuments.partyId))
      .where(
        and(
          eq(rentalEvents.tenantId, user.tenantId),
          isNull(rentalEvents.voidedAt),
          isNull(businessDocuments.voidedAt),
          sql`${rentalEvents.hireFrom} <= ${to}`,
          sql`${rentalEvents.hireTo} >= ${from}`,
        ),
      );

    const barConditions = [
      eq(rentalBookingLines.tenantId, user.tenantId),
      isNull(rentalBookingLines.voidedAt),
      inArray(rentalBookingLines.status, [...ACTIVE_STATUSES]),
      sql`${rentalBookingLines.hireFrom} <= ${to}`,
      sql`${rentalBookingLines.hireTo} >= ${from}`,
    ];
    if (input.productId) barConditions.push(eq(rentalBookingLines.productId, input.productId));

    const barRows = await db()
      .select({
        id: rentalBookingLines.id,
        productId: rentalBookingLines.productId,
        sku: inventoryProducts.sku,
        productName: inventoryProducts.name,
        qty: rentalBookingLines.qty,
        hireFrom: rentalBookingLines.hireFrom,
        hireTo: rentalBookingLines.hireTo,
        documentNumber: businessDocuments.documentNumber,
        status: rentalBookingLines.status,
      })
      .from(rentalBookingLines)
      .innerJoin(inventoryProducts, eq(inventoryProducts.id, rentalBookingLines.productId))
      .innerJoin(businessDocuments, eq(businessDocuments.id, rentalBookingLines.documentId))
      .where(and(...barConditions));

    return {
      events: eventRows.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        hireFrom: r.hireFrom,
        hireTo: r.hireTo,
        eventDate: r.eventDate,
        venue: r.venue,
        guestCount: r.guestCount,
        documentNumber: r.documentNumber,
        documentType: r.documentType,
        partyName: r.partyName,
        status: r.status,
      })),
      bars: barRows.map((r) => ({
        id: r.id,
        productId: r.productId,
        sku: r.sku,
        productName: r.productName,
        qty: Number(r.qty),
        hireFrom: r.hireFrom,
        hireTo: r.hireTo,
        documentNumber: r.documentNumber,
        status: r.status,
      })),
    };
  });
}

export async function currentlyOnRentQty(tenantId: string, productId: string, onDate: string): Promise<number> {
  return committedQty({
    tenantId,
    productId,
    hireFrom: onDate,
    hireTo: onDate,
  });
}
