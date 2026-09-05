'use server';

import { revalidatePath } from 'next/cache';
import {
  availableQty,
  datesOverlap,
  hireInvoiceTimingError,
  inferInvoiceStage,
  invoiceTimingAllowed,
  isHireInvoiceTiming,
  isRentalProduct,
  padHireTo,
} from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  businessDocuments,
  db,
  desc,
  eq,
  inArray,
  isNull,
  inventoryMovements,
  inventoryProducts,
  inventoryStockLevels,
  locations,
  parties,
  rentalBookingLines,
  rentalEvents,
  rentalReturnPhotos,
  sql,
  withTenantContext,
} from '@bookone/db';
import { getRentalSettings } from '@/app/actions/rental-settings';
import {
  enabledInvoiceTimings,
  MAX_RETURN_PHOTOS,
  resolveHireWindow,
  type InvoiceTiming,
  type OverlapPolicy,
  type RentalEventInput,
} from '@/lib/rental-core';

const ACTIVE_STATUSES = ['hold', 'reserved', 'dispatched'] as const;

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
    invoiceTiming:
      params.event.invoiceTiming && isHireInvoiceTiming(params.event.invoiceTiming)
        ? params.event.invoiceTiming
        : settings.defaultInvoiceTiming,
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
    invoiceTiming: isHireInvoiceTiming(row.invoiceTiming) ? row.invoiceTiming : 'on_confirm',
  };
}

export async function assertHireInvoiceTiming(params: {
  tenantId: string;
  documentType: string;
  sourceDocumentId?: string | null;
  hasRentalLines: boolean;
  requestedTiming?: string | null;
  confirmTimingOverride?: boolean;
}): Promise<InvoiceTiming | null> {
  if (!params.hasRentalLines) return null;
  if (!['quotation', 'sales_order', 'sales_invoice', 'pos_sale'].includes(params.documentType)) {
    return null;
  }

  const settings = await getRentalSettings();
  const enabled = enabledInvoiceTimings(settings);
  let sourceTiming: InvoiceTiming | null = null;
  if (params.sourceDocumentId) {
    const [event] = await db()
      .select({ invoiceTiming: rentalEvents.invoiceTiming })
      .from(rentalEvents)
      .where(
        and(
          eq(rentalEvents.tenantId, params.tenantId),
          eq(rentalEvents.documentId, params.sourceDocumentId),
          isNull(rentalEvents.voidedAt),
        ),
      )
      .limit(1);
    if (event && isHireInvoiceTiming(event.invoiceTiming)) {
      sourceTiming = event.invoiceTiming;
    }
  }

  const requested: InvoiceTiming | null = isHireInvoiceTiming(params.requestedTiming ?? '')
    ? (params.requestedTiming as InvoiceTiming)
    : null;
  let timing: InvoiceTiming = sourceTiming ?? settings.defaultInvoiceTiming;
  if (requested) {
    if (!enabled.includes(requested)) {
      throw new Error(`Invoice timing “${requested}” is not enabled for this company.`);
    }
    if (
      requested !== settings.defaultInvoiceTiming &&
      requested !== sourceTiming &&
      !settings.allowInvoiceTimingOverride
    ) {
      throw new Error('This company does not allow a different invoice timing on each booking.');
    }
    timing = requested;
  } else if (!enabled.includes(timing)) {
    timing = enabled[0]!;
  }

  const isInvoice = params.documentType === 'sales_invoice' || params.documentType === 'pos_sale';
  if (!isInvoice) return timing;

  let statuses: string[] = [];
  if (params.sourceDocumentId) {
    const rows = await db()
      .select({ status: rentalBookingLines.status })
      .from(rentalBookingLines)
      .where(
        and(
          eq(rentalBookingLines.tenantId, params.tenantId),
          eq(rentalBookingLines.documentId, params.sourceDocumentId),
          isNull(rentalBookingLines.voidedAt),
        ),
      );
    statuses = rows.map((r) => r.status);
  }
  const stage = inferInvoiceStage(statuses);
  if (!invoiceTimingAllowed(timing, stage)) {
    if (params.confirmTimingOverride) {
      if (!settings.allowInvoiceTimingOverride) {
        throw new Error('This company does not allow invoicing before the configured hire stage.');
      }
      return timing;
    }
    throw new Error(
      hireInvoiceTimingError(timing, stage) ??
        'Hire invoice timing does not allow invoicing at this stage.',
    );
  }
  return timing;
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
    documentId: string;
    documentNumber: string;
    documentType: string;
    partyName: string;
    status: string;
  }[];
}> {
  const user = await requireTenantContext();
  const isYmd = (v?: string | null) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  const from = isYmd(input.from) ? input.from : new Date().toISOString().slice(0, 8) + '01';
  const to = isYmd(input.to) ? input.to : from;
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
        documentId: rentalBookingLines.documentId,
        documentNumber: businessDocuments.documentNumber,
        documentType: businessDocuments.documentType,
        partyName: parties.name,
        status: rentalBookingLines.status,
      })
      .from(rentalBookingLines)
      .innerJoin(inventoryProducts, eq(inventoryProducts.id, rentalBookingLines.productId))
      .innerJoin(businessDocuments, eq(businessDocuments.id, rentalBookingLines.documentId))
      .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
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
        documentId: r.documentId,
        documentNumber: r.documentNumber,
        documentType: r.documentType,
        partyName: r.partyName ?? 'Customer',
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

export type RentalJobLine = {
  id: string;
  documentId: string;
  documentNumber: string;
  documentType: string;
  partyName: string;
  productId: string;
  sku: string;
  productName: string;
  qty: number;
  dispatchedQty: number;
  returnedQty: number;
  damagedQty: number;
  missingQty: number;
  hireFrom: string;
  hireTo: string;
  status: string;
  venue: string | null;
  overdue: boolean;
  daysOverdue: number;
  replacementPrice: number;
  depositAmount: number;
  depositHeld: number;
  depositApplied: number;
  depositRefunded: number;
  depositOpen: number;
  defaultLateFeePerDay: number;
  defaultTurnaroundHours: number;
  eventHireFrom: string;
  eventHireTo: string;
  invoiceTiming: string;
  returnPhotoUrls: string[];
};

async function fleetLocationId(tenantId: string, type: 'on_rent' | 'repair' | 'wash'): Promise<string> {
  const [row] = await db()
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(eq(locations.tenantId, tenantId), eq(locations.locationType, type), isNull(locations.voidedAt)),
    )
    .limit(1);
  if (!row) {
    throw new Error(`Missing ${type.replace('_', ' ')} location. Add it under Company → Locations.`);
  }
  return row.id;
}

async function pickWarehouseLocation(
  tenantId: string,
  productId: string,
  preferredId: string | null,
  qty: number,
): Promise<string> {
  if (preferredId) {
    const [loc] = await db()
      .select({ id: locations.id, locationType: locations.locationType })
      .from(locations)
      .where(eq(locations.id, preferredId))
      .limit(1);
    if (loc && loc.locationType !== 'on_rent' && loc.locationType !== 'repair' && loc.locationType !== 'wash') {
      return loc.id;
    }
  }
  const rows = await db()
    .select({
      locationId: inventoryStockLevels.locationId,
      qty: inventoryStockLevels.qtyOnHand,
      locationType: locations.locationType,
    })
    .from(inventoryStockLevels)
    .leftJoin(locations, eq(locations.id, inventoryStockLevels.locationId))
    .where(and(eq(inventoryStockLevels.tenantId, tenantId), eq(inventoryStockLevels.productId, productId)));
  const operational = rows.filter(
    (r) => r.locationId && r.locationType !== 'on_rent' && r.locationType !== 'repair' && r.locationType !== 'wash',
  );
  const withStock = operational.find((r) => Number(r.qty) + 0.0001 >= qty);
  if (withStock?.locationId) return withStock.locationId;
  if (operational[0]?.locationId) return operational[0].locationId;
  const [fallback] = await db()
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.tenantId, tenantId),
        isNull(locations.voidedAt),
        sql`${locations.locationType} not in ('on_rent','repair','wash')`,
      ),
    )
    .limit(1);
  if (!fallback) throw new Error('No warehouse location found to dispatch from.');
  return fallback.id;
}

async function consumeAtLocation(params: {
  tenantId: string;
  userId: string;
  productId: string;
  locationId: string;
  quantity: number;
  memo: string;
  docDate: string;
}): Promise<void> {
  const [level] = await db()
    .select()
    .from(inventoryStockLevels)
    .where(
      and(
        eq(inventoryStockLevels.tenantId, params.tenantId),
        eq(inventoryStockLevels.productId, params.productId),
        eq(inventoryStockLevels.locationId, params.locationId),
      ),
    )
    .limit(1);
  const current = Number(level?.qtyOnHand ?? 0);
  const next = current - params.quantity;
  if (level) {
    await db()
      .update(inventoryStockLevels)
      .set({ qtyOnHand: next.toFixed(4), updatedAt: new Date() })
      .where(eq(inventoryStockLevels.id, level.id));
  } else {
    await db().insert(inventoryStockLevels).values({
      tenantId: params.tenantId,
      productId: params.productId,
      locationId: params.locationId,
      qtyOnHand: next.toFixed(4),
    });
  }
  const [product] = await db()
    .select({ unitCost: inventoryProducts.unitCost })
    .from(inventoryProducts)
    .where(eq(inventoryProducts.id, params.productId))
    .limit(1);
  await db().insert(inventoryMovements).values({
    tenantId: params.tenantId,
    userId: params.userId,
    movementType: 'adjustment',
    productId: params.productId,
    quantity: (-params.quantity).toFixed(4),
    unitCost: Number(product?.unitCost ?? 0).toFixed(2),
    fromLocationId: params.locationId,
    toLocationId: null,
    referenceType: 'rental_return',
    referenceId: null,
    memo: params.memo,
    movementDate: params.docDate,
  });
}

function revalidateRentalPaths(documentId?: string) {
  revalidatePath('/inventory/on-rent');
  revalidatePath('/inventory/levels');
  revalidatePath('/inventory/calendar');
  revalidatePath('/sales/invoices');
  if (documentId) revalidatePath(`/sales/invoices/${documentId}`);
}

export async function listRentalJobs(filter?: {
  documentId?: string;
  status?: string;
}): Promise<RentalJobLine[]> {
  const user = await requireTenantContext();
  const today = new Date().toISOString().slice(0, 10);
  const settings = await getRentalSettings();
  const latePerDay = Number(settings.defaultLateFeePerDay) || 0;
  return withTenantContext(user.tenantId, async () => {
    const conditions = [
      eq(rentalBookingLines.tenantId, user.tenantId),
      isNull(rentalBookingLines.voidedAt),
    ];
    if (filter?.documentId) conditions.push(eq(rentalBookingLines.documentId, filter.documentId));
    if (filter?.status) conditions.push(eq(rentalBookingLines.status, filter.status));
    else if (filter?.documentId) {
      conditions.push(inArray(rentalBookingLines.status, ['reserved', 'dispatched', 'returned']));
    } else conditions.push(inArray(rentalBookingLines.status, ['reserved', 'dispatched']));

    const rows = await db()
      .select({
        id: rentalBookingLines.id,
        documentId: rentalBookingLines.documentId,
        documentNumber: businessDocuments.documentNumber,
        documentType: businessDocuments.documentType,
        partyName: parties.name,
        productId: rentalBookingLines.productId,
        sku: inventoryProducts.sku,
        productName: inventoryProducts.name,
        qty: rentalBookingLines.qty,
        dispatchedQty: rentalBookingLines.dispatchedQty,
        returnedQty: rentalBookingLines.returnedQty,
        damagedQty: rentalBookingLines.damagedQty,
        missingQty: rentalBookingLines.missingQty,
        hireFrom: rentalBookingLines.hireFrom,
        hireTo: rentalBookingLines.hireTo,
        status: rentalBookingLines.status,
        venue: rentalEvents.venue,
        replacementPrice: inventoryProducts.replacementPrice,
        depositAmount: inventoryProducts.depositAmount,
        depositHeld: rentalEvents.depositHeld,
        depositApplied: rentalEvents.depositApplied,
        depositRefunded: rentalEvents.depositRefunded,
        eventHireFrom: rentalEvents.hireFrom,
        eventHireTo: rentalEvents.hireTo,
        invoiceTiming: rentalEvents.invoiceTiming,
      })
      .from(rentalBookingLines)
      .innerJoin(inventoryProducts, eq(inventoryProducts.id, rentalBookingLines.productId))
      .innerJoin(businessDocuments, eq(businessDocuments.id, rentalBookingLines.documentId))
      .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
      .leftJoin(
        rentalEvents,
        and(eq(rentalEvents.documentId, rentalBookingLines.documentId), isNull(rentalEvents.voidedAt)),
      )
      .where(and(...conditions))
      .orderBy(desc(rentalBookingLines.hireFrom));

    const lineIds = rows.map((r) => r.id);
    const photoRows =
      lineIds.length === 0
        ? []
        : await db()
            .select({
              bookingLineId: rentalReturnPhotos.bookingLineId,
              imageKey: rentalReturnPhotos.imageKey,
            })
            .from(rentalReturnPhotos)
            .where(
              and(
                eq(rentalReturnPhotos.tenantId, user.tenantId),
                inArray(rentalReturnPhotos.bookingLineId, lineIds),
              ),
            );
    const { resolveProductImageUrl } = await import('@/lib/product-image');
    const urlsByLine = new Map<string, string[]>();
    for (const photo of photoRows) {
      const url = await resolveProductImageUrl(photo.imageKey);
      if (!url) continue;
      const list = urlsByLine.get(photo.bookingLineId) ?? [];
      list.push(url);
      urlsByLine.set(photo.bookingLineId, list);
    }

    return rows.map((r) => {
      const overdue = r.status === 'dispatched' && r.hireTo < today;
      const days = overdue
        ? Math.max(
            1,
            Math.ceil(
              (Date.parse(`${today}T12:00:00`) - Date.parse(`${r.hireTo}T12:00:00`)) / 86_400_000,
            ),
          )
        : 0;
      const held = Number(r.depositHeld ?? 0);
      const applied = Number(r.depositApplied ?? 0);
      const refunded = Number(r.depositRefunded ?? 0);
      return {
        id: r.id,
        documentId: r.documentId,
        documentNumber: r.documentNumber,
        documentType: r.documentType,
        partyName: r.partyName ?? 'Unknown',
        productId: r.productId,
        sku: r.sku,
        productName: r.productName,
        qty: Number(r.qty),
        dispatchedQty: Number(r.dispatchedQty),
        returnedQty: Number(r.returnedQty),
        damagedQty: Number(r.damagedQty),
        missingQty: Number(r.missingQty),
        hireFrom: r.hireFrom,
        hireTo: r.hireTo,
        status: r.status,
        venue: r.venue,
        overdue,
        daysOverdue: days,
        replacementPrice: Number(r.replacementPrice ?? 0),
        depositAmount: Number(r.depositAmount ?? 0),
        depositHeld: held,
        depositApplied: applied,
        depositRefunded: refunded,
        depositOpen: Math.max(0, Math.round((held - applied - refunded) * 100) / 100),
        defaultLateFeePerDay: latePerDay,
        defaultTurnaroundHours: settings.defaultTurnaroundHours,
        eventHireFrom: r.eventHireFrom || r.hireFrom,
        eventHireTo: r.eventHireTo || r.hireTo,
        invoiceTiming: r.invoiceTiming && isHireInvoiceTiming(r.invoiceTiming) ? r.invoiceTiming : 'on_confirm',
        returnPhotoUrls: urlsByLine.get(r.id) ?? [],
      };
    });
  });
}

export async function dispatchRentalLine(
  bookingLineId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireTenantContext();
    await withTenantContext(user.tenantId, async () => {
      const [line] = await db()
        .select()
        .from(rentalBookingLines)
        .where(
          and(
            eq(rentalBookingLines.id, bookingLineId),
            eq(rentalBookingLines.tenantId, user.tenantId),
            isNull(rentalBookingLines.voidedAt),
          ),
        )
        .limit(1);
      if (!line) throw new Error('Booking line not found.');
      if (line.status !== 'reserved') {
        throw new Error('Confirm the booking (order or invoice) before dispatch.');
      }
      const qty = Number(line.qty) - Number(line.dispatchedQty);
      if (qty <= 0.0001) throw new Error('This line is already dispatched.');
      const fromLocationId = await pickWarehouseLocation(
        user.tenantId,
        line.productId,
        line.locationId,
        qty,
      );
      const onRentId = await fleetLocationId(user.tenantId, 'on_rent');
      const { createStockTransfer } = await import('@/app/actions/inventory');
      const moved = await createStockTransfer({
        fromLocationId,
        toLocationId: onRentId,
        reason: 'Rental dispatch',
        notes: `Dispatch ${line.id}`,
        lines: [{ productId: line.productId, quantity: qty }],
      });
      if (!moved.ok) throw new Error(moved.error || 'Dispatch transfer failed.');
      await db()
        .update(rentalBookingLines)
        .set({
          status: 'dispatched',
          dispatchedQty: (Number(line.dispatchedQty) + qty).toFixed(4),
          locationId: onRentId,
          updatedAt: new Date(),
        })
        .where(eq(rentalBookingLines.id, line.id));
      revalidateRentalPaths(line.documentId);
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Dispatch failed.' };
  }
}

export async function returnRentalLine(input: {
  bookingLineId: string;
  goodQty: number;
  damagedQty: number;
  missingQty: number;
  dirtyQty?: number;
  goodDestination?: 'warehouse' | 'wash';
  photos?: File[];
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const goodQty = Math.max(0, Number(input.goodQty) || 0);
    const dirtyQty = Math.max(0, Number(input.dirtyQty) || 0);
    const damagedQty = Math.max(0, Number(input.damagedQty) || 0);
    const missingQty = Math.max(0, Number(input.missingQty) || 0);
    const total = goodQty + dirtyQty + damagedQty + missingQty;
    if (total <= 0) return { ok: false, error: 'Enter good, dirty, damaged, or missing qty.' };

    const user = await requireTenantContext();
    const settings = await getRentalSettings();
    await withTenantContext(user.tenantId, async () => {
      const [line] = await db()
        .select()
        .from(rentalBookingLines)
        .where(
          and(
            eq(rentalBookingLines.id, input.bookingLineId),
            eq(rentalBookingLines.tenantId, user.tenantId),
            isNull(rentalBookingLines.voidedAt),
          ),
        )
        .limit(1);
      if (!line) throw new Error('Booking line not found.');
      if (line.status !== 'dispatched') throw new Error('Dispatch this line before returning it.');
      const outstanding =
        Number(line.dispatchedQty) -
        Number(line.returnedQty) -
        Number(line.damagedQty) -
        Number(line.missingQty);
      if (total > outstanding + 0.0001) {
        throw new Error(`Return qty ${total} is more than outstanding ${Math.max(0, outstanding)}.`);
      }
      const onRentId = await fleetLocationId(user.tenantId, 'on_rent');
      const { createStockTransfer } = await import('@/app/actions/inventory');
      const today = new Date().toISOString().slice(0, 10);
      const goodDestination =
        input.goodDestination === 'wash' || input.goodDestination === 'warehouse'
          ? input.goodDestination
          : settings.defaultTurnaroundHours > 0
            ? 'wash'
            : 'warehouse';
      if (goodQty > 0) {
        const toLocationId =
          goodDestination === 'wash'
            ? await fleetLocationId(user.tenantId, 'wash')
            : await pickWarehouseLocation(user.tenantId, line.productId, null, 0);
        const moved = await createStockTransfer({
          fromLocationId: onRentId,
          toLocationId,
          reason: 'Rental return',
          notes: `Return good ${line.id} → ${goodDestination}`,
          lines: [{ productId: line.productId, quantity: goodQty }],
        });
        if (!moved.ok) throw new Error(moved.error || 'Good return transfer failed.');
      }
      if (dirtyQty > 0) {
        const washId = await fleetLocationId(user.tenantId, 'wash');
        const moved = await createStockTransfer({
          fromLocationId: onRentId,
          toLocationId: washId,
          reason: 'Rental return wash',
          notes: `Return dirty ${line.id}`,
          lines: [{ productId: line.productId, quantity: dirtyQty }],
        });
        if (!moved.ok) throw new Error(moved.error || 'Dirty return transfer failed.');
      }
      if (damagedQty > 0) {
        const repairId = await fleetLocationId(user.tenantId, 'repair');
        const moved = await createStockTransfer({
          fromLocationId: onRentId,
          toLocationId: repairId,
          reason: 'Rental damage',
          notes: `Return damaged ${line.id}`,
          lines: [{ productId: line.productId, quantity: damagedQty }],
        });
        if (!moved.ok) throw new Error(moved.error || 'Damaged return transfer failed.');
      }
      if (missingQty > 0) {
        await consumeAtLocation({
          tenantId: user.tenantId,
          userId: user.id,
          productId: line.productId,
          locationId: onRentId,
          quantity: missingQty,
          memo: `Missing on return ${line.id}`,
          docDate: today,
        });
      }
      const nextReturned = Number(line.returnedQty) + goodQty + dirtyQty;
      const nextDamaged = Number(line.damagedQty) + damagedQty;
      const nextMissing = Number(line.missingQty) + missingQty;
      const remaining = Number(line.dispatchedQty) - nextReturned - nextDamaged - nextMissing;
      await db()
        .update(rentalBookingLines)
        .set({
          returnedQty: nextReturned.toFixed(4),
          damagedQty: nextDamaged.toFixed(4),
          missingQty: nextMissing.toFixed(4),
          status: remaining <= 0.0001 ? 'returned' : 'dispatched',
          updatedAt: new Date(),
        })
        .where(eq(rentalBookingLines.id, line.id));

      const files = (input.photos ?? []).filter((f) => f && typeof f.size === 'number' && f.size > 0);
      if (files.length > MAX_RETURN_PHOTOS) {
        throw new Error(`At most ${MAX_RETURN_PHOTOS} return photos per line.`);
      }
      if (files.length > 0) {
        const { saveRentalInspectPhoto } = await import('@/lib/product-image');
        for (const file of files) {
          const saved = await saveRentalInspectPhoto({
            tenantId: user.tenantId,
            bookingLineId: line.id,
            file,
          });
          await db().insert(rentalReturnPhotos).values({
            tenantId: user.tenantId,
            bookingLineId: line.id,
            documentId: line.documentId,
            imageKey: saved.imageKey,
            createdBy: user.id,
          });
        }
      }
      revalidateRentalPaths(line.documentId);
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Return failed.' };
  }
}

export async function extendRentalHire(input: {
  documentId: string;
  hireTo: string;
  confirmOverlap?: boolean;
  overlapOverrideReason?: string | null;
}): Promise<{ ok: boolean; error?: string; hireTo?: string }> {
  try {
    const newTo = (input.hireTo ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newTo)) {
      return { ok: false, error: 'Pick a new hire-to date.' };
    }
    const user = await requireTenantContext();
    const settings = await getRentalSettings();
    let nextTo = newTo;
    await withTenantContext(user.tenantId, async () => {
      const [event] = await db()
        .select()
        .from(rentalEvents)
        .where(
          and(
            eq(rentalEvents.tenantId, user.tenantId),
            eq(rentalEvents.documentId, input.documentId),
            isNull(rentalEvents.voidedAt),
          ),
        )
        .limit(1);
      if (!event) throw new Error('This document has no hire event.');
      if (newTo <= event.hireTo) {
        throw new Error(`New hire-to ${newTo} must be after the current end ${event.hireTo}.`);
      }
      const lines = await db()
        .select()
        .from(rentalBookingLines)
        .where(
          and(
            eq(rentalBookingLines.tenantId, user.tenantId),
            eq(rentalBookingLines.documentId, input.documentId),
            isNull(rentalBookingLines.voidedAt),
            inArray(rentalBookingLines.status, [...ACTIVE_STATUSES]),
          ),
        );
      if (lines.length === 0) throw new Error('Nothing left on hire to extend.');
      await assertAvailability({
        tenantId: user.tenantId,
        userRole: user.role,
        locationId: lines[0]?.locationId ?? null,
        hireFrom: event.hireFrom,
        hireTo: newTo,
        lines: lines.map((l) => ({ productId: l.productId, quantity: Number(l.qty) })),
        excludeDocumentId: input.documentId,
        policy: settings.overlapPolicy,
        confirmOverlap: Boolean(input.confirmOverlap),
        overrideReason: input.overlapOverrideReason,
        defaultTurnaroundHours: settings.defaultTurnaroundHours,
      });
      const collectAt = !event.collectAt || event.collectAt === event.hireTo ? newTo : event.collectAt;
      await db()
        .update(rentalEvents)
        .set({
          hireTo: newTo,
          collectAt,
          overlapOverrideReason: input.overlapOverrideReason || event.overlapOverrideReason,
          overlapOverriddenBy:
            input.confirmOverlap && canOverrideOverlap(user.role) ? user.id : event.overlapOverriddenBy,
          updatedAt: new Date(),
        })
        .where(eq(rentalEvents.id, event.id));
      for (const line of lines) {
        const [product] = await db()
          .select({ turnaroundHours: inventoryProducts.turnaroundHours })
          .from(inventoryProducts)
          .where(eq(inventoryProducts.id, line.productId))
          .limit(1);
        const hours =
          product?.turnaroundHours != null && product.turnaroundHours !== ''
            ? Number(product.turnaroundHours)
            : settings.defaultTurnaroundHours;
        const paddedTo = padHireTo(newTo, Number.isFinite(hours) ? hours : 0);
        await db()
          .update(rentalBookingLines)
          .set({ hireTo: paddedTo, updatedAt: new Date() })
          .where(eq(rentalBookingLines.id, line.id));
      }
      nextTo = newTo;
      revalidateRentalPaths(input.documentId);
    });
    return { ok: true, hireTo: nextTo };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not extend hire.' };
  }
}

export type FleetBayRow = {
  productId: string;
  sku: string;
  name: string;
  locationId: string;
  locationType: 'wash' | 'repair';
  locationName: string;
  qty: number;
};

export async function listFleetBays(): Promise<FleetBayRow[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        productId: inventoryStockLevels.productId,
        sku: inventoryProducts.sku,
        name: inventoryProducts.name,
        locationId: inventoryStockLevels.locationId,
        locationType: locations.locationType,
        locationName: locations.name,
        qty: inventoryStockLevels.qtyOnHand,
      })
      .from(inventoryStockLevels)
      .innerJoin(inventoryProducts, eq(inventoryProducts.id, inventoryStockLevels.productId))
      .innerJoin(locations, eq(locations.id, inventoryStockLevels.locationId))
      .where(
        and(
          eq(inventoryStockLevels.tenantId, user.tenantId),
          isNull(inventoryProducts.voidedAt),
          inArray(locations.locationType, ['wash', 'repair']),
        ),
      );
    return rows
      .filter((r) => r.locationId && Number(r.qty) > 0.0001)
      .map((r) => ({
        productId: r.productId,
        sku: r.sku,
        name: r.name,
        locationId: r.locationId!,
        locationType: r.locationType === 'repair' ? 'repair' : 'wash',
        locationName: r.locationName,
        qty: Number(r.qty),
      }));
  });
}

export async function releaseFleetBay(input: {
  productId: string;
  locationId: string;
  qty: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const qty = Math.max(0, Number(input.qty) || 0);
    if (qty <= 0) return { ok: false, error: 'Enter a qty to mark ready.' };
    const user = await requireTenantContext();
    await withTenantContext(user.tenantId, async () => {
      const warehouseId = await pickWarehouseLocation(user.tenantId, input.productId, null, 0);
      const { createStockTransfer } = await import('@/app/actions/inventory');
      const moved = await createStockTransfer({
        fromLocationId: input.locationId,
        toLocationId: warehouseId,
        reason: 'Rental turnaround',
        notes: `Ready from bay ${input.locationId}`,
        lines: [{ productId: input.productId, quantity: qty }],
      });
      if (!moved.ok) throw new Error(moved.error || 'Could not move kit to warehouse.');
      revalidateRentalPaths();
      revalidatePath('/inventory/levels');
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not mark ready.' };
  }
}
