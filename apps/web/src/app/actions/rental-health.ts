'use server';

import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  and,
  db,
  eq,
  inventoryProducts,
  inventoryStockLevels,
  isNull,
  journalEntries,
  journalLines,
  locations,
  withTenantContext,
} from '@bookone/db';
import { createCommercialDocument, getCommercialDocument } from '@/app/actions/commercial-docs';
import { createQuickProduct } from '@/app/actions/inventory';
import {
  dispatchRentalLine,
  listFleetBays,
  listRentalJobs,
  releaseFleetBay,
  returnRentalLine,
} from '@/app/actions/rental-bookings';

export type RentalIntegrityIssue = { id: string; detail: string };

export async function checkRentalIntegrity(tenantId: string): Promise<RentalIntegrityIssue[]> {
  const issues: RentalIntegrityIssue[] = [];
  const needed = ['2400', '4400', '4450', '5150'];
  const acct = await db()
    .select({ code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), isNull(accounts.voidedAt)));
  const have = new Set(acct.map((a) => a.code));
  for (const code of needed) {
    if (!have.has(code)) issues.push({ id: `coa-${code}`, detail: `Chart is missing account ${code}` });
  }
  const locs = await db()
    .select({ locationType: locations.locationType, code: locations.code })
    .from(locations)
    .where(and(eq(locations.tenantId, tenantId), isNull(locations.voidedAt)));
  for (const type of ['on_rent', 'repair', 'wash'] as const) {
    if (!locs.some((l) => l.locationType === type)) {
      issues.push({ id: `loc-${type}`, detail: `Missing ${type.replace('_', ' ')} location` });
    }
  }
  const badRevenue = await db()
    .select({ sku: inventoryProducts.sku, revenueAccountCode: inventoryProducts.revenueAccountCode })
    .from(inventoryProducts)
    .where(
      and(
        eq(inventoryProducts.tenantId, tenantId),
        eq(inventoryProducts.productType, 'rental'),
        isNull(inventoryProducts.voidedAt),
      ),
    );
  for (const p of badRevenue) {
    if (p.revenueAccountCode === '4000' || p.revenueAccountCode === '4200') {
      issues.push({
        id: `rev-${p.sku}`,
        detail: `Hire SKU ${p.sku} posts to ${p.revenueAccountCode} (should be 4400)`,
      });
    }
  }
  return issues;
}

export async function runRentalHireLoop(params: {
  tenantId: string;
  brandId: string | null;
  locationId: string | null;
  seed: number;
  issueDate: string;
}): Promise<{
  detail: string;
  meta: Record<string, string | number | boolean | null>;
  transactionIds: string[];
  documentIds: string[];
}> {
  await requireTenantContext();
  const issues = await withTenantContext(params.tenantId, () => checkRentalIntegrity(params.tenantId));
  if (issues.length) {
    throw new Error(issues.map((i) => i.detail).join('; '));
  }
  if (!params.locationId) throw new Error('Rental health needs a warehouse location.');

  const created = await createQuickProduct({
    name: `HC Hire Chair ${params.seed}`,
    productType: 'rental',
    sellPrice: 150,
    unitCost: 800,
  });
  if (!created.ok || !created.product) throw new Error(created.error ?? 'Could not create hire SKU.');

  await withTenantContext(params.tenantId, async () => {
    await db().insert(inventoryStockLevels).values({
      tenantId: params.tenantId,
      productId: created.product!.id,
      locationId: params.locationId,
      qtyOnHand: '4.0000',
    });
  });

  const invoice = await createCommercialDocument({
    documentType: 'sales_invoice',
    partyName: `HC Hire Customer ${params.seed}`,
    issueDate: params.issueDate,
    saleChannel: 'local',
    invoiceKind: 'commercial',
    brandId: params.brandId,
    locationId: params.locationId,
    eventDate: params.issueDate,
    hireFrom: params.issueDate,
    hireTo: params.issueDate,
    venue: 'Health-check lawn',
    invoiceTiming: 'on_confirm',
    confirmTimingOverride: true,
    notes: `health-check hire ${params.seed}`,
    lines: [
      {
        productId: created.product.id,
        description: created.product.name,
        quantity: 2,
        unitPrice: 150,
      },
    ],
  });
  if (!invoice.ok || !invoice.id) throw new Error(invoice.error ?? 'Hire invoice failed.');

  const doc = await getCommercialDocument(invoice.id);
  if (!doc?.transactionId) throw new Error('Hire invoice did not post a journal.');

  const journal = await withTenantContext(params.tenantId, async () => {
    return db()
      .select({ code: journalLines.accountId, side: journalLines.side, amount: journalLines.amount, acct: accounts.code })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(eq(journalEntries.transactionId, doc.transactionId!));
  });
  const codes = journal.map((j) => `${j.side}:${j.acct}`);
  if (!codes.some((c) => c === 'credit:4400')) {
    throw new Error(`Hire invoice must credit 4400. Journal: ${codes.join(', ')}`);
  }
  if (codes.some((c) => c.endsWith(':5000') || c.endsWith(':5100'))) {
    throw new Error(`Hire invoice must not post COGS/stock. Journal: ${codes.join(', ')}`);
  }

  const jobs = await listRentalJobs({ documentId: invoice.id });
  const line = jobs[0];
  if (!line) throw new Error('Hire invoice created no booking line.');
  const dispatched = await dispatchRentalLine(line.id);
  if (!dispatched.ok) throw new Error(dispatched.error ?? 'Dispatch failed.');

  const returned = await returnRentalLine({
    bookingLineId: line.id,
    goodQty: 2,
    damagedQty: 0,
    missingQty: 0,
    dirtyQty: 0,
    goodDestination: 'wash',
  });
  if (!returned.ok) throw new Error(returned.error ?? 'Return to wash failed.');

  const bays = await listFleetBays();
  const wash = bays.find((b) => b.productId === created.product.id && b.locationType === 'wash');
  if (!wash || wash.qty < 1.999) {
    throw new Error(`Expected 2 on wash after return, got ${wash?.qty ?? 0}.`);
  }
  const released = await releaseFleetBay({
    productId: wash.productId,
    locationId: wash.locationId,
    qty: 2,
  });
  if (!released.ok) throw new Error(released.error ?? 'Release from wash failed.');

  return {
    detail: `Hire ${doc.documentNumber} · Cr 4400 · dispatch → wash → warehouse`,
    meta: {
      productId: created.product.id,
      invoiceId: invoice.id,
      transactionId: doc.transactionId,
    },
    transactionIds: [doc.transactionId],
    documentIds: [invoice.id],
  };
}
