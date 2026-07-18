'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  buildSalesInvoicePosting,
  buildSalesReturnPosting,
  buildVendorBillPosting,
  buildPurchaseReturnPosting,
  isPhysicalProduct,
  amountInWordsLkr,
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
  gte,
  lte,
  inArray,
  journalEntries,
  journalLines,
  parties,
  periodLocks,
  inventoryProducts,
  inventoryStockLevels,
  inventoryMovements,
  salesDiscounts,
  salesSettings,
  taxInvoiceSequences,
  salesInvoiceSources,
  sql,
  transactions,
  withTenantContext,
} from '@bookone/db';
import { ensureParty } from '@/app/actions/parties';

export type CommercialDocType =
  | 'quotation'
  | 'sales_order'
  | 'sales_invoice'
  | 'sales_return'
  | 'pos_sale'
  | 'purchase_order'
  | 'purchase' // local purchase (AP)
  | 'import_purchase' // import purchase (AP + inventory)
  | 'purchase_return'
  | 'vendor_bill' // legacy alias of purchase
  | 'customer_invoice'; // legacy

const lineSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1).max(1000),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  unitCost: z.number().min(0).optional().default(0),
  discountAmount: z.number().min(0).optional().default(0),
  accountCode: z.string().max(20).optional(),
});

const createSchema = z.object({
  documentType: z.enum([
    'quotation',
    'sales_order',
    'sales_invoice',
    'sales_return',
    'pos_sale',
    'purchase_order',
    'purchase',
    'import_purchase',
    'purchase_return',
    'vendor_bill',
  ]),
  partyName: z.string().min(1).max(255),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
  notes: z.string().max(1000).optional(),
  additionalInfo: z.string().max(2000).optional(),
  discountId: z.string().uuid().optional().nullable(),
  headerDiscount: z.number().min(0).optional().default(0),
  sourceDocumentId: z.string().uuid().optional().nullable(),
  sourceOrderIds: z.array(z.string().uuid()).optional(),
  paymentAccountCode: z.string().max(20).optional(), // POS / cash invoice
  saleChannel: z.enum(['local', 'export']).optional().default('local'),
  invoiceKind: z.enum(['commercial', 'tax_invoice']).optional().default('commercial'),
  placeOfSupply: z.string().max(255).optional(),
  paymentMode: z.string().max(40).optional(),
  exportCountry: z.string().max(100).optional(),
  exportRef: z.string().max(120).optional(),
  purchaserTin: z.string().max(50).optional(),
  purchaserPhone: z.string().max(40).optional(),
  purchaserAddress: z.string().max(500).optional(),
  registerId: z.string().uuid().optional().nullable(),
  shiftId: z.string().uuid().optional().nullable(),
  posMode: z.enum(['sale', 'return']).optional().nullable(),
  sourcePosSaleId: z.string().uuid().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** Tax invoice no: YYMMM_DEPT/SERIAL e.g. 26JUL_01/1 */
async function nextTaxInvoiceNumber(tenantId: string, issueDate: string, deptCode: string): Promise<string> {
  const d = new Date(`${issueDate}T12:00:00`);
  const yy = String(d.getFullYear()).slice(-2);
  const mmm = MONTHS[d.getMonth()];
  const dept = (deptCode || '01').trim().toUpperCase();

  const [seq] = await db()
    .select()
    .from(taxInvoiceSequences)
    .where(
      and(
        eq(taxInvoiceSequences.tenantId, tenantId),
        eq(taxInvoiceSequences.yearYy, yy),
        eq(taxInvoiceSequences.monthMmm, mmm),
        eq(taxInvoiceSequences.deptCode, dept),
      ),
    )
    .limit(1);

  let serial = 1;
  if (seq) {
    serial = Number(seq.lastSerial) + 1;
    await db()
      .update(taxInvoiceSequences)
      .set({ lastSerial: serial, updatedAt: new Date() })
      .where(eq(taxInvoiceSequences.id, seq.id));
  } else {
    await db().insert(taxInvoiceSequences).values({
      tenantId,
      yearYy: yy,
      monthMmm: mmm,
      deptCode: dept,
      lastSerial: serial,
    });
  }
  return `${yy}${mmm}_${dept}/${serial}`;
}

async function loadSalesVatConfig(tenantId: string, saleChannel: string, invoiceKind: string) {
  const [settings] = await db()
    .select()
    .from(salesSettings)
    .where(eq(salesSettings.tenantId, tenantId))
    .limit(1);
  const vatRegistered = settings?.vatRegistered === '1';
  const dept = settings?.taxInvoiceDeptCode ?? '01';
  let vatRate = 0;
  if (invoiceKind === 'tax_invoice' && vatRegistered) {
    vatRate =
      saleChannel === 'export'
        ? Number(settings?.exportVatRatePercent ?? 0)
        : Number(settings?.vatRatePercent ?? 18);
  }
  return { vatRate, dept, vatRegistered };
}

const PREFIX: Record<string, string> = {
  quotation: 'QT',
  sales_order: 'SO',
  sales_invoice: 'INV',
  sales_return: 'SR',
  pos_sale: 'POS',
  purchase_order: 'PO',
  purchase: 'PUR',
  import_purchase: 'IMP',
  purchase_return: 'PR',
  vendor_bill: 'BILL',
  customer_invoice: 'INV',
};

const SALES_TYPES = ['quotation', 'sales_order', 'sales_invoice', 'sales_return', 'pos_sale', 'customer_invoice'] as const;
const PURCHASE_TYPES = [
  'purchase_order',
  'purchase',
  'import_purchase',
  'purchase_return',
  'vendor_bill',
] as const;

function isPurchaseBillType(type: string) {
  return type === 'purchase' || type === 'import_purchase' || type === 'vendor_bill';
}

function postsToGl(type: string) {
  return [
    'sales_invoice',
    'sales_return',
    'pos_sale',
    'purchase',
    'import_purchase',
    'purchase_return',
    'vendor_bill',
    'customer_invoice',
  ].includes(type);
}

function defaultStatus(type: string) {
  if (type === 'quotation') return 'draft';
  if (type === 'sales_order' || type === 'purchase_order') return 'confirmed';
  if (type === 'pos_sale') return 'paid';
  if (type === 'sales_return') return 'open';
  return 'open';
}

async function resolveAccount(tenantId: string, code: string) {
  const [account] = await db()
    .select({ id: accounts.id, code: accounts.code, name: accounts.name, type: accounts.type })
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

async function nextDocumentNumber(tenantId: string, type: string, date: string) {
  const prefix = PREFIX[type] ?? 'DOC';
  const compactDate = date.replace(/-/g, '');
  const types = type === 'sales_invoice' ? ['sales_invoice', 'customer_invoice'] : [type];
  const [{ total }] = await db()
    .select({ total: sql<number>`count(*)` })
    .from(businessDocuments)
    .where(
      and(
        eq(businessDocuments.tenantId, tenantId),
        inArray(businessDocuments.documentType, types),
        gte(businessDocuments.issueDate, `${date.slice(0, 7)}-01`),
        lte(businessDocuments.issueDate, `${date.slice(0, 7)}-31`),
        isNull(businessDocuments.voidedAt),
      ),
    );
  return `${prefix}-${compactDate}-${String(Number(total ?? 0) + 1).padStart(4, '0')}`;
}

async function adjustStock(params: {
  tenantId: string;
  userId: string;
  productId: string;
  quantityDelta: number;
  unitCost: number;
  movementType: string;
  date: string;
  referenceType: string;
  referenceId: string;
  transactionId?: string | null;
  memo?: string;
  locationId?: string | null;
}) {
  const [level] = await db()
    .select()
    .from(inventoryStockLevels)
    .where(
      and(
        eq(inventoryStockLevels.tenantId, params.tenantId),
        eq(inventoryStockLevels.productId, params.productId),
        params.locationId
          ? eq(inventoryStockLevels.locationId, params.locationId)
          : sql`${inventoryStockLevels.locationId} is null`,
      ),
    )
    .limit(1);

  const current = Number(level?.qtyOnHand ?? 0);
  const next = current + params.quantityDelta;

  if (level) {
    await db()
      .update(inventoryStockLevels)
      .set({ qtyOnHand: next.toFixed(4), updatedAt: new Date() })
      .where(eq(inventoryStockLevels.id, level.id));
  } else {
    await db().insert(inventoryStockLevels).values({
      tenantId: params.tenantId,
      productId: params.productId,
      locationId: params.locationId ?? null,
      qtyOnHand: next.toFixed(4),
    });
  }

  await db().insert(inventoryMovements).values({
    tenantId: params.tenantId,
    userId: params.userId,
    movementType: params.movementType,
    productId: params.productId,
    quantity: params.quantityDelta.toFixed(4),
    unitCost: params.unitCost.toFixed(2),
    fromLocationId: params.quantityDelta < 0 ? params.locationId ?? null : null,
    toLocationId: params.quantityDelta > 0 ? params.locationId ?? null : null,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    transactionId: params.transactionId ?? null,
    memo: params.memo ?? null,
    movementDate: params.date,
  });
}

export interface CommercialDocRow {
  id: string;
  documentType: string;
  documentNumber: string;
  taxInvoiceNumber: string | null;
  invoiceKind: string;
  saleChannel: string;
  partyName: string;
  issueDate: string;
  dueDate: string | null;
  status: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  paidAmount: number;
  balanceDue: number;
  currency: string;
  sourceDocumentId: string | null;
}

export async function listCommercialDocuments(types: string[], period?: string): Promise<CommercialDocRow[]> {
  const user = await requireTenantContext();
  const selectedPeriod = period && period !== 'all' && /^\d{4}-\d{2}$/.test(period) ? period : null;

  return withTenantContext(user.tenantId, async () => {
    const conditions = [
      eq(businessDocuments.tenantId, user.tenantId),
      inArray(businessDocuments.documentType, types),
      isNull(businessDocuments.voidedAt),
    ];
    if (selectedPeriod) {
      conditions.push(gte(businessDocuments.issueDate, `${selectedPeriod}-01`));
      conditions.push(lte(businessDocuments.issueDate, `${selectedPeriod}-31`));
    }

    const rows = await db()
      .select({
        id: businessDocuments.id,
        documentType: businessDocuments.documentType,
        documentNumber: businessDocuments.documentNumber,
        taxInvoiceNumber: businessDocuments.taxInvoiceNumber,
        invoiceKind: businessDocuments.invoiceKind,
        saleChannel: businessDocuments.saleChannel,
        partyName: parties.name,
        issueDate: businessDocuments.issueDate,
        dueDate: businessDocuments.dueDate,
        status: businessDocuments.status,
        subtotal: businessDocuments.subtotal,
        discountTotal: businessDocuments.discountTotal,
        total: businessDocuments.total,
        paidAmount: businessDocuments.paidAmount,
        balanceDue: businessDocuments.balanceDue,
        currency: businessDocuments.currency,
        sourceDocumentId: businessDocuments.sourceDocumentId,
      })
      .from(businessDocuments)
      .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
      .where(and(...conditions))
      .orderBy(desc(businessDocuments.issueDate), desc(businessDocuments.createdAt));

    return rows.map((row) => ({
      id: row.id,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      taxInvoiceNumber: row.taxInvoiceNumber,
      invoiceKind: row.invoiceKind ?? 'commercial',
      saleChannel: row.saleChannel ?? 'local',
      partyName: row.partyName ?? 'Unknown',
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      status: row.status,
      subtotal: Number(row.subtotal),
      discountTotal: Number(row.discountTotal),
      total: Number(row.total),
      paidAmount: Number(row.paidAmount),
      balanceDue: Number(row.balanceDue),
      currency: row.currency,
      sourceDocumentId: row.sourceDocumentId,
    }));
  });
}

export async function createCommercialDocument(
  input: z.input<typeof createSchema>,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const parsed = createSchema.parse(input);
    const user = await requireTenantContext();
    const isSales = (SALES_TYPES as readonly string[]).includes(parsed.documentType);
    const party = await ensureParty({
      name: parsed.partyName,
      kind: isSales ? 'customer' : 'vendor',
      isCustomer: isSales,
      isVendor: !isSales,
    });
    if (party.status === 'blocked') {
      return { ok: false, error: 'This party is blocked. Unblock them in Parties before posting.' };
    }
    if (party.status === 'inactive') {
      return { ok: false, error: 'This party is inactive. Restore them in Parties before posting.' };
    }

    const id = await withTenantContext(user.tenantId, async () => {
      if (postsToGl(parsed.documentType)) {
        await assertOpenPeriod(user.tenantId, parsed.issueDate);
      }

      // Enrich lines from products
      const enriched = [];
      for (const line of parsed.lines) {
        let unitCost = line.unitCost ?? 0;
        let productType = 'service';
        let description = line.description;
        if (line.productId) {
          const [product] = await db()
            .select()
            .from(inventoryProducts)
            .where(
              and(
                eq(inventoryProducts.tenantId, user.tenantId),
                eq(inventoryProducts.id, line.productId),
                isNull(inventoryProducts.voidedAt),
              ),
            )
            .limit(1);
          if (product) {
            unitCost = Number(product.unitCost);
            productType = product.productType === 'stocked' ? 'physical' : product.productType;
            if (!description) description = product.name;
          }
        }
        const lineGross = line.quantity * line.unitPrice;
        const discountAmount = line.discountAmount ?? 0;
        const lineTotal = Math.max(0, lineGross - discountAmount);
        enriched.push({
          ...line,
          description,
          unitCost,
          productType,
          lineTotal,
          discountAmount,
        });
      }

      let subtotal = enriched.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      let lineDiscountSum = enriched.reduce((s, l) => s + l.discountAmount, 0);
      let headerDiscount = parsed.headerDiscount ?? 0;

      if (parsed.discountId) {
        const [disc] = await db()
          .select()
          .from(salesDiscounts)
          .where(
            and(
              eq(salesDiscounts.tenantId, user.tenantId),
              eq(salesDiscounts.id, parsed.discountId),
              isNull(salesDiscounts.voidedAt),
            ),
          )
          .limit(1);
        if (disc && disc.isActive === '1') {
          const base = subtotal - lineDiscountSum;
          headerDiscount =
            disc.discountType === 'percent'
              ? Math.round(((base * Number(disc.value)) / 100) * 100) / 100
              : Number(disc.value);
        }
      }

      const supplyExVat = Math.max(0, Math.round((subtotal - lineDiscountSum - headerDiscount) * 100) / 100);
      const saleChannel = parsed.saleChannel ?? 'local';
      const invoiceKind = parsed.invoiceKind ?? 'commercial';
      const isSalesInvoiceType = parsed.documentType === 'sales_invoice';
      const isPosSale = parsed.documentType === 'pos_sale';
      const appliesSalesVat = isSalesInvoiceType || isPosSale;

      const vatCfg = appliesSalesVat
        ? await loadSalesVatConfig(user.tenantId, saleChannel, invoiceKind)
        : { vatRate: 0, dept: '01', vatRegistered: false };

      const vatRate = vatCfg.vatRate;
      const vatTotal =
        appliesSalesVat && invoiceKind === 'tax_invoice'
          ? Math.round(((supplyExVat * vatRate) / 100) * 100) / 100
          : 0;
      const total = Math.round((supplyExVat + vatTotal) * 100) / 100;

      const documentNumber = await nextDocumentNumber(user.tenantId, parsed.documentType, parsed.issueDate);
      let taxInvoiceNumber: string | null = null;
      if (appliesSalesVat && invoiceKind === 'tax_invoice') {
        taxInvoiceNumber = await nextTaxInvoiceNumber(user.tenantId, parsed.issueDate, vatCfg.dept);
      }

      let status = defaultStatus(parsed.documentType);
      const settled =
        parsed.documentType === 'pos_sale' ||
        (parsed.documentType === 'sales_return' &&
          Boolean(parsed.paymentAccountCode) &&
          parsed.posMode === 'return') ||
        Boolean(
          parsed.paymentAccountCode &&
            postsToGl(parsed.documentType) &&
            !isPurchaseBillType(parsed.documentType) &&
            parsed.documentType !== 'purchase_return' &&
            parsed.documentType !== 'sales_return',
        );
      if (parsed.documentType === 'sales_return' && settled) {
        status = 'refunded';
      }

      let transactionId: string | null = null;
      let postedAt: Date | null = null;
      let amountInWords: string | null = null;

      if (postsToGl(parsed.documentType)) {
        const saleLines = enriched.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unitCost: l.unitCost,
          discountAmount: l.discountAmount,
          productType: l.productType,
        }));

        let postingLines;
        let accountingType = 'invoice_bill';
        let direction = 'money_in';
        let paymentAccountCode = '1300';
        let postedTotal = total;

        if (parsed.documentType === 'sales_return') {
          const built = buildSalesReturnPosting({
            lines: saleLines,
            refundCashAccountCode: parsed.paymentAccountCode ?? null,
            memo: documentNumber,
          });
          postingLines = built.lines;
          accountingType = 'sales_return';
          direction = 'money_out';
          paymentAccountCode = parsed.paymentAccountCode ?? '1300';
          postedTotal = built.netTotal;
        } else if (isPurchaseBillType(parsed.documentType)) {
          const expenseCode = enriched[0]?.accountCode || '6800';
          const forceInventory =
            parsed.documentType === 'import_purchase' || enriched.some((l) => isPhysicalProduct(l.productType));
          postingLines = buildVendorBillPosting({
            total: supplyExVat,
            expenseAccountCode: expenseCode,
            memo: documentNumber,
            isInventoryPurchase: forceInventory,
          });
          accountingType = parsed.documentType === 'import_purchase' ? 'import_purchase' : 'invoice_bill';
          direction = 'money_out';
          paymentAccountCode = '2100';
          postedTotal = supplyExVat;
        } else if (parsed.documentType === 'purchase_return') {
          const expenseCode = enriched[0]?.accountCode || '6800';
          postingLines = buildPurchaseReturnPosting({
            total: supplyExVat,
            expenseAccountCode: expenseCode,
            isInventoryPurchase: enriched.some((l) => isPhysicalProduct(l.productType)),
            memo: documentNumber,
          });
          accountingType = 'purchase_return';
          direction = 'money_in';
          paymentAccountCode = '2100';
          postedTotal = supplyExVat;
        } else {
          // sales_invoice | pos_sale
          const cashCode =
            parsed.documentType === 'pos_sale'
              ? parsed.paymentAccountCode || '1000'
              : parsed.paymentAccountCode || null;
          const built = buildSalesInvoicePosting({
            lines: saleLines,
            headerDiscount,
            settledCashAccountCode: cashCode,
            vatRatePercent: appliesSalesVat && invoiceKind === 'tax_invoice' ? vatRate : 0,
            memo: taxInvoiceNumber ?? documentNumber,
          });
          postingLines = built.lines;
          paymentAccountCode = cashCode ?? '1300';
          direction = 'money_in';
          accountingType = cashCode ? 'sale' : 'invoice_bill';
          postedTotal = built.grandTotal;
          amountInWords = amountInWordsLkr(built.grandTotal);
        }

        // Resolve account ids and write journal
        const accountMap = new Map<string, { id: string; code: string; name: string }>();
        for (const pl of postingLines) {
          if (!accountMap.has(pl.accountCode)) {
            accountMap.set(pl.accountCode, await resolveAccount(user.tenantId, pl.accountCode));
          }
        }
        const paymentAccount = accountMap.get(paymentAccountCode) ?? (await resolveAccount(user.tenantId, paymentAccountCode));

        const [createdTx] = await db()
          .insert(transactions)
          .values({
            tenantId: user.tenantId,
            userId: user.id,
            accountingType,
            direction,
            party: party.name,
            description: `${taxInvoiceNumber ?? documentNumber}: ${enriched[0]?.description ?? parsed.documentType}`.slice(0, 1000),
            amount: postedTotal.toFixed(2),
            currency: 'LKR',
            paymentMethod:
              paymentAccount.code === '1000' ? 'Cash' : paymentAccount.code === '1200' ? 'Card' : paymentAccount.code === '1100' ? 'Bank' : 'Credit',
            paymentAccountId: paymentAccount.id,
            date: parsed.issueDate,
            categoryCode: postingLines.find((l) => l.accountCode === '4000' || l.accountCode === '4100' || l.accountCode.startsWith('6'))?.accountCode ?? null,
            categoryName: null,
            categoryConfidence: '1.00',
            categorySource: 'document',
            invoiceRef: documentNumber,
            isAlreadySettled: settled || parsed.documentType === 'pos_sale' ? '1' : '0',
            notes: parsed.notes ?? null,
          })
          .returning({ id: transactions.id });

        transactionId = createdTx.id;
        postedAt = new Date();

        const [journal] = await db()
          .insert(journalEntries)
          .values({
            tenantId: user.tenantId,
            userId: user.id,
            transactionId: createdTx.id,
            memo: `${documentNumber} ${party.name}`,
            entryDate: parsed.issueDate,
            isBalanced: '1',
          })
          .returning({ id: journalEntries.id });

        await db().insert(journalLines).values(
          postingLines.map((pl) => ({
            tenantId: user.tenantId,
            journalEntryId: journal.id,
            accountId: accountMap.get(pl.accountCode)!.id,
            side: pl.side,
            amount: pl.amount.toFixed(2),
            memo: pl.memo,
          })),
        );
      }

      const [document] = await db()
        .insert(businessDocuments)
        .values({
          tenantId: user.tenantId,
          userId: user.id,
          partyId: party.id,
          transactionId,
          documentType: parsed.documentType,
          documentNumber,
          issueDate: parsed.issueDate,
          dueDate: parsed.dueDate || null,
          status,
          sourceDocumentId: parsed.sourceDocumentId ?? null,
          discountId: parsed.discountId ?? null,
          discountTotal: headerDiscount.toFixed(2),
          subtotal: supplyExVat.toFixed(2),
          taxTotal: vatTotal.toFixed(2),
          total: total.toFixed(2),
          paidAmount: settled || parsed.documentType === 'pos_sale' ? total.toFixed(2) : '0',
          balanceDue: settled || parsed.documentType === 'pos_sale' ? '0' : total.toFixed(2),
          currency: 'LKR',
          notes: parsed.notes ?? null,
          saleChannel,
          invoiceKind: appliesSalesVat ? invoiceKind : 'commercial',
          deliveryDate: parsed.deliveryDate || null,
          placeOfSupply: parsed.placeOfSupply || null,
          paymentMode: parsed.paymentMode || null,
          taxInvoiceNumber,
          exportCountry: saleChannel === 'export' ? parsed.exportCountry || null : null,
          exportRef: saleChannel === 'export' ? parsed.exportRef || null : null,
          additionalInfo: parsed.additionalInfo || null,
          vatRate: vatRate.toFixed(2),
          amountInWords:
            amountInWords ??
            (appliesSalesVat || isPosSale || (parsed.documentType === 'sales_return' && settled)
              ? amountInWordsLkr(total)
              : null),
          purchaserTin: parsed.purchaserTin || party.tin || null,
          purchaserPhone: parsed.purchaserPhone || party.phoneMobile || party.phone || null,
          purchaserAddress: parsed.purchaserAddress || party.addressLine1 || party.address || null,
          registerId: parsed.registerId ?? null,
          shiftId: parsed.shiftId ?? null,
          posMode:
            parsed.posMode ??
            (isPosSale ? 'sale' : parsed.documentType === 'sales_return' ? 'return' : null),
          sourcePosSaleId: parsed.sourcePosSaleId ?? null,
          postedAt,
        })
        .returning({ id: businessDocuments.id });

      // Multi sales-order → invoice links
      const orderIds = [
        ...(parsed.sourceOrderIds ?? []),
        ...(parsed.sourceDocumentId ? [parsed.sourceDocumentId] : []),
      ].filter((v, i, a) => a.indexOf(v) === i);

      if (isSalesInvoiceType && orderIds.length > 0) {
        for (const orderId of orderIds) {
          await db().insert(salesInvoiceSources).values({
            tenantId: user.tenantId,
            invoiceId: document.id,
            salesOrderId: orderId,
          });
          await db()
            .update(businessDocuments)
            .set({ status: 'fully_invoiced', updatedAt: new Date() })
            .where(
              and(
                eq(businessDocuments.tenantId, user.tenantId),
                eq(businessDocuments.id, orderId),
                eq(businessDocuments.documentType, 'sales_order'),
              ),
            );
        }
      }

      for (const line of enriched) {
        let accountId: string | null = null;
        const code = line.accountCode || (isSales ? '4000' : '6800');
        try {
          const acc = await resolveAccount(user.tenantId, code);
          accountId = acc.id;
        } catch {
          accountId = null;
        }

        await db().insert(businessDocumentLines).values({
          tenantId: user.tenantId,
          documentId: document.id,
          productId: line.productId ?? null,
          accountId,
          description: line.description,
          quantity: line.quantity.toFixed(4),
          unitPrice: line.unitPrice.toFixed(2),
          unitCost: line.unitCost.toFixed(2),
          discountPercent: '0',
          discountAmount: line.discountAmount.toFixed(2),
          lineTotal: line.lineTotal.toFixed(2),
        });

        // Stock qty only for physical products on posted sales/purchases/returns
        if (line.productId && isPhysicalProduct(line.productType) && postsToGl(parsed.documentType)) {
          const isSalesReturn = parsed.documentType === 'sales_return';
          const isSale = ['sales_invoice', 'pos_sale', 'customer_invoice'].includes(parsed.documentType);
          const isPurchase = isPurchaseBillType(parsed.documentType);
          const isPurchaseReturn = parsed.documentType === 'purchase_return';
          let delta = 0;
          if (isSale) delta = -line.quantity;
          if (isSalesReturn) delta = line.quantity;
          if (isPurchase) delta = line.quantity;
          if (isPurchaseReturn) delta = -line.quantity;
          if (delta !== 0) {
            await adjustStock({
              tenantId: user.tenantId,
              userId: user.id,
              productId: line.productId,
              quantityDelta: delta,
              unitCost: line.unitCost,
              movementType: isSalesReturn || isPurchaseReturn ? 'return' : isPurchase ? 'purchase' : 'sale',
              date: parsed.issueDate,
              referenceType: 'business_document',
              referenceId: document.id,
              transactionId,
              memo: documentNumber,
            });
          }
        }
      }

      if (parsed.sourceDocumentId) {
        await db()
          .update(businessDocuments)
          .set({ status: 'converted', updatedAt: new Date() })
          .where(
            and(
              eq(businessDocuments.tenantId, user.tenantId),
              eq(businessDocuments.id, parsed.sourceDocumentId),
            ),
          );
      }

      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'CREATE',
        tableName: 'business_documents',
        recordId: document.id,
        newValues: { documentNumber, documentType: parsed.documentType, total },
        notes: postsToGl(parsed.documentType)
          ? 'Created commercial document and posted journal.'
          : 'Created commercial document (no journal).',
      });

      return document.id;
    });

    revalidatePath('/sales/quotations');
    revalidatePath('/sales/orders');
    revalidatePath('/sales/invoices');
    revalidatePath('/sales/returns');
    revalidatePath('/sales/pos');
    revalidatePath('/purchase/orders');
    revalidatePath('/purchase/purchases');
    revalidatePath('/purchase/import');
    revalidatePath('/purchase/returns');
    revalidatePath('/purchase/bills');
    revalidatePath('/documents');
    revalidatePath('/transactions');
    revalidatePath('/journal');
    revalidatePath('/reports');
    revalidatePath('/inventory/products');
    return { ok: true, id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create document.';
    return { ok: false, error: message };
  }
}

export async function createCommercialDocumentFromForm(formData: FormData): Promise<void> {
  const documentType = String(formData.get('documentType') ?? 'quotation') as z.infer<typeof createSchema>['documentType'];
  const lineCount = Number(formData.get('lineCount') ?? 1);
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    const description = String(formData.get(`line_${i}_description`) ?? '').trim();
    const quantity = Number(String(formData.get(`line_${i}_quantity`) ?? '1').replace(/[^0-9.-]/g, '')) || 1;
    const unitPrice = Number(String(formData.get(`line_${i}_unitPrice`) ?? '0').replace(/[^0-9.-]/g, '')) || 0;
    const productId = String(formData.get(`line_${i}_productId`) ?? '');
    const discountAmount = Number(String(formData.get(`line_${i}_discount`) ?? '0').replace(/[^0-9.-]/g, '')) || 0;
    if (!description && !productId) continue;
    lines.push({
      productId: productId || null,
      description: description || 'Line item',
      quantity,
      unitPrice,
      unitCost: 0,
      discountAmount,
      accountCode: String(formData.get(`line_${i}_accountCode`) ?? '') || undefined,
    });
  }

  if (lines.length === 0) {
    lines.push({
      productId: null,
      description: String(formData.get('description') ?? 'Item'),
      quantity: Number(String(formData.get('quantity') ?? '1').replace(/[^0-9.-]/g, '')) || 1,
      unitPrice: Number(String(formData.get('unitPrice') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
      unitCost: 0,
      discountAmount: 0,
      accountCode: String(formData.get('accountCode') ?? '') || undefined,
    });
  }

  const selectedParty = String(formData.get('partyName') ?? '').trim();
  const overrideParty = String(formData.get('partyNameOverride') ?? '').trim();
  const partyName =
    overrideParty ||
    (selectedParty && selectedParty !== '__new__' ? selectedParty : '') ||
    overrideParty;

  const sourceOrderIds = formData
    .getAll('sourceOrderIds')
    .map(String)
    .filter((id) => id && id.length > 10);

  const result = await createCommercialDocument({
    documentType,
    partyName: partyName || 'Walk-in',
    issueDate: String(formData.get('issueDate') ?? new Date().toISOString().slice(0, 10)),
    dueDate: String(formData.get('dueDate') ?? ''),
    deliveryDate: String(formData.get('deliveryDate') ?? ''),
    notes: String(formData.get('notes') ?? ''),
    additionalInfo: String(formData.get('additionalInfo') ?? ''),
    discountId: String(formData.get('discountId') ?? '') || null,
    headerDiscount: Number(String(formData.get('headerDiscount') ?? '0').replace(/[^0-9.-]/g, '')) || 0,
    sourceDocumentId: String(formData.get('sourceDocumentId') ?? '') || null,
    sourceOrderIds,
    paymentAccountCode: String(formData.get('paymentAccountCode') ?? '') || undefined,
    saleChannel: (String(formData.get('saleChannel') ?? 'local') as 'local' | 'export') || 'local',
    invoiceKind: (String(formData.get('invoiceKind') ?? 'commercial') as 'commercial' | 'tax_invoice') || 'commercial',
    placeOfSupply: String(formData.get('placeOfSupply') ?? ''),
    paymentMode: String(formData.get('paymentMode') ?? ''),
    exportCountry: String(formData.get('exportCountry') ?? ''),
    exportRef: String(formData.get('exportRef') ?? ''),
    purchaserTin: String(formData.get('purchaserTin') ?? ''),
    purchaserPhone: String(formData.get('purchaserPhone') ?? ''),
    purchaserAddress: String(formData.get('purchaserAddress') ?? ''),
    lines,
  });

  if (!result.ok) {
    throw new Error(result.error ?? 'Could not create document.');
  }

  const { redirect } = await import('next/navigation');
  const listPath: Record<string, string> = {
    quotation: '/sales/quotations',
    sales_order: '/sales/orders',
    sales_invoice: '/sales/invoices',
    sales_return: '/sales/returns',
    pos_sale: '/sales/pos',
    purchase_order: '/purchase/orders',
    purchase: '/purchase/purchases',
    import_purchase: '/purchase/import',
    purchase_return: '/purchase/returns',
    vendor_bill: '/purchase/purchases',
  };
  redirect(listPath[documentType] ?? '/sales/invoices');
}

export async function convertDocument(
  sourceId: string,
  targetType: 'sales_order' | 'sales_invoice' | 'purchase_order' | 'purchase' | 'vendor_bill',
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const [source] = await db()
        .select()
        .from(businessDocuments)
        .where(
          and(
            eq(businessDocuments.tenantId, user.tenantId),
            eq(businessDocuments.id, sourceId),
            isNull(businessDocuments.voidedAt),
          ),
        )
        .limit(1);
      if (!source) throw new Error('Source document not found.');

      const [party] = await db()
        .select({ name: parties.name })
        .from(parties)
        .where(eq(parties.id, source.partyId))
        .limit(1);

      const lines = await db()
        .select()
        .from(businessDocumentLines)
        .where(
          and(
            eq(businessDocumentLines.documentId, sourceId),
            isNull(businessDocumentLines.voidedAt),
          ),
        );

      return createCommercialDocument({
        documentType: targetType,
        partyName: party?.name ?? 'Unknown',
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: source.dueDate ?? '',
        notes: source.notes ?? undefined,
        sourceDocumentId: source.id,
        headerDiscount: Number(source.discountTotal),
        lines: lines.map((l) => ({
          productId: l.productId,
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          unitCost: Number(l.unitCost),
          discountAmount: Number(l.discountAmount),
        })),
      });
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Convert failed.' };
  }
}

export async function convertDocumentAction(formData: FormData): Promise<void> {
  const sourceId = String(formData.get('sourceId') ?? '');
  const targetType = String(formData.get('targetType') ?? 'sales_order') as
    | 'sales_order'
    | 'sales_invoice'
    | 'purchase_order'
    | 'purchase'
    | 'vendor_bill';
  await convertDocument(sourceId, targetType);
  const { redirect } = await import('next/navigation');
  const listPath: Record<string, string> = {
    sales_order: '/sales/orders',
    sales_invoice: '/sales/invoices',
    purchase_order: '/purchase/orders',
    purchase: '/purchase/purchases',
    vendor_bill: '/purchase/purchases',
  };
  redirect(listPath[targetType] ?? '/sales/orders');
}

/** Combine multiple sales orders into one sales invoice. */
export async function convertMultipleOrdersToInvoice(formData: FormData): Promise<void> {
  const orderIds = formData.getAll('orderIds').map(String).filter(Boolean);
  if (orderIds.length === 0) throw new Error('Select at least one sales order.');

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const orders = await db()
      .select()
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.tenantId, user.tenantId),
          inArray(businessDocuments.id, orderIds),
          eq(businessDocuments.documentType, 'sales_order'),
          isNull(businessDocuments.voidedAt),
        ),
      );
    if (orders.length === 0) throw new Error('No sales orders found.');
    const partyId = orders[0].partyId;
    if (orders.some((o) => o.partyId !== partyId)) {
      throw new Error('All sales orders must belong to the same customer.');
    }
    if (orders.some((o) => o.status === 'fully_invoiced')) {
      throw new Error('One or more selected orders are already fully invoiced.');
    }

    const [party] = await db()
      .select({
        name: parties.name,
        tin: parties.tin,
        phone: parties.phone,
        phoneMobile: parties.phoneMobile,
        address: parties.address,
        addressLine1: parties.addressLine1,
      })
      .from(parties)
      .where(eq(parties.id, partyId))
      .limit(1);

    const lines = [];
    for (const order of orders) {
      const orderLines = await db()
        .select()
        .from(businessDocumentLines)
        .where(
          and(eq(businessDocumentLines.documentId, order.id), isNull(businessDocumentLines.voidedAt)),
        );
      for (const l of orderLines) {
        lines.push({
          productId: l.productId,
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          unitCost: Number(l.unitCost),
          discountAmount: Number(l.discountAmount),
        });
      }
    }
    if (lines.length === 0) throw new Error('Selected orders have no lines.');

    const result = await createCommercialDocument({
      documentType: 'sales_invoice',
      partyName: party?.name ?? 'Customer',
      issueDate: new Date().toISOString().slice(0, 10),
      sourceOrderIds: orders.map((o) => o.id),
      sourceDocumentId: orders[0].id,
      saleChannel: 'local',
      invoiceKind: 'commercial',
      purchaserTin: party?.tin ?? undefined,
      purchaserPhone: party?.phoneMobile ?? party?.phone ?? undefined,
      purchaserAddress: party?.addressLine1 ?? party?.address ?? undefined,
      lines,
    });
    if (!result.ok) throw new Error(result.error ?? 'Invoice create failed.');
  });

  const { redirect } = await import('next/navigation');
  redirect('/sales/invoices?flash=created');
}

export async function getInvoicePrintData(invoiceId: string) {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [doc] = await db()
      .select()
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.tenantId, user.tenantId),
          eq(businessDocuments.id, invoiceId),
          isNull(businessDocuments.voidedAt),
        ),
      )
      .limit(1);
    if (!doc) return null;

    const [party] = await db()
      .select()
      .from(parties)
      .where(eq(parties.id, doc.partyId))
      .limit(1);

    const lines = await db()
      .select()
      .from(businessDocumentLines)
      .where(and(eq(businessDocumentLines.documentId, doc.id), isNull(businessDocumentLines.voidedAt)));

    const { companyProfiles, taxProfiles } = await import('@bookone/db');
    const [company] = await db()
      .select()
      .from(companyProfiles)
      .where(eq(companyProfiles.tenantId, user.tenantId))
      .limit(1);
    const [tax] = await db()
      .select()
      .from(taxProfiles)
      .where(eq(taxProfiles.tenantId, user.tenantId))
      .limit(1);

    return {
      doc,
      party,
      lines,
      company,
      tax,
    };
  });
}

export async function listActiveDiscounts() {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    return db()
      .select({
        id: salesDiscounts.id,
        name: salesDiscounts.name,
        code: salesDiscounts.code,
        discountType: salesDiscounts.discountType,
        value: salesDiscounts.value,
      })
      .from(salesDiscounts)
      .where(
        and(
          eq(salesDiscounts.tenantId, user.tenantId),
          eq(salesDiscounts.isActive, '1'),
          isNull(salesDiscounts.voidedAt),
        ),
      );
  });
}

export interface CommercialDocDetail {
  id: string;
  documentType: string;
  documentNumber: string;
  partyName: string;
  issueDate: string;
  dueDate: string | null;
  status: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  balanceDue: number;
  currency: string;
  notes: string | null;
  paymentMode: string | null;
  saleChannel: string;
  invoiceKind: string;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
}

export async function getCommercialDocument(id: string): Promise<CommercialDocDetail | null> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [doc] = await db()
      .select()
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.tenantId, user.tenantId),
          eq(businessDocuments.id, id),
          isNull(businessDocuments.voidedAt),
        ),
      )
      .limit(1);
    if (!doc) return null;

    const [party] = await db()
      .select({ name: parties.name })
      .from(parties)
      .where(eq(parties.id, doc.partyId))
      .limit(1);

    const lines = await db()
      .select()
      .from(businessDocumentLines)
      .where(
        and(eq(businessDocumentLines.documentId, doc.id), isNull(businessDocumentLines.voidedAt)),
      );

    return {
      id: doc.id,
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      partyName: party?.name ?? 'Unknown',
      issueDate: doc.issueDate,
      dueDate: doc.dueDate,
      status: doc.status,
      subtotal: Number(doc.subtotal),
      discountTotal: Number(doc.discountTotal),
      taxTotal: Number(doc.taxTotal),
      total: Number(doc.total),
      balanceDue: Number(doc.balanceDue),
      currency: doc.currency,
      notes: doc.notes,
      paymentMode: doc.paymentMode,
      saleChannel: doc.saleChannel ?? 'local',
      invoiceKind: doc.invoiceKind ?? 'commercial',
      lines: lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        lineTotal: Number(l.lineTotal),
      })),
    };
  });
}

const NON_GL_TYPES = new Set(['quotation', 'sales_order', 'purchase_order']);

/** Soft-delete (void). Blocked if posted to GL (has transaction). */
export async function deleteCommercialDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireTenantContext();
    await withTenantContext(user.tenantId, async () => {
      const [doc] = await db()
        .select()
        .from(businessDocuments)
        .where(
          and(
            eq(businessDocuments.tenantId, user.tenantId),
            eq(businessDocuments.id, id),
            isNull(businessDocuments.voidedAt),
          ),
        )
        .limit(1);
      if (!doc) throw new Error('Document not found.');
      if (doc.transactionId) {
        throw new Error('Cannot delete a posted document. Void it from accounting controls later.');
      }
      if (doc.status === 'converted' || doc.status === 'fully_invoiced') {
        throw new Error('Cannot delete a converted / fully invoiced document. Archive instead.');
      }

      await db()
        .update(businessDocuments)
        .set({ voidedAt: new Date(), status: 'void', updatedAt: new Date() })
        .where(eq(businessDocuments.id, id));

      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'DELETE',
        tableName: 'business_documents',
        recordId: id,
        notes: `Deleted ${doc.documentType} ${doc.documentNumber}`,
      });
    });
    revalidatePath('/sales/quotations');
    revalidatePath('/sales/orders');
    revalidatePath('/sales/invoices');
    revalidatePath('/purchase/orders');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Delete failed.' };
  }
}

/** Archive = hide from active workflow (status archived). */
export async function archiveCommercialDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireTenantContext();
    await withTenantContext(user.tenantId, async () => {
      const [doc] = await db()
        .select()
        .from(businessDocuments)
        .where(
          and(
            eq(businessDocuments.tenantId, user.tenantId),
            eq(businessDocuments.id, id),
            isNull(businessDocuments.voidedAt),
          ),
        )
        .limit(1);
      if (!doc) throw new Error('Document not found.');
      if (doc.status === 'converted' || doc.status === 'fully_invoiced') {
        throw new Error('Already converted — leave as historical record.');
      }

      await db()
        .update(businessDocuments)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(businessDocuments.id, id));

      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'UPDATE',
        tableName: 'business_documents',
        recordId: id,
        notes: `Archived ${doc.documentNumber}`,
      });
    });
    revalidatePath('/sales/quotations');
    revalidatePath('/sales/orders');
    revalidatePath('/sales/invoices');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Archive failed.' };
  }
}

export async function restoreCommercialDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireTenantContext();
    await withTenantContext(user.tenantId, async () => {
      const [doc] = await db()
        .select()
        .from(businessDocuments)
        .where(
          and(
            eq(businessDocuments.tenantId, user.tenantId),
            eq(businessDocuments.id, id),
            isNull(businessDocuments.voidedAt),
          ),
        )
        .limit(1);
      if (!doc) throw new Error('Document not found.');
      if (doc.status !== 'archived') throw new Error('Only archived documents can be restored.');

      const nextStatus = NON_GL_TYPES.has(doc.documentType)
        ? doc.documentType === 'quotation'
          ? 'draft'
          : 'confirmed'
        : 'open';

      await db()
        .update(businessDocuments)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(businessDocuments.id, id));
    });
    revalidatePath('/sales/quotations');
    revalidatePath('/sales/orders');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Restore failed.' };
  }
}

/** Update header fields on non-posted commercial docs (quotes / orders). */
export async function updateCommercialDocumentHeaderFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '').trim();
  const issueDate = String(formData.get('issueDate') ?? '').trim();
  const dueDate = String(formData.get('dueDate') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  if (!id) throw new Error('Document id required.');

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const [doc] = await db()
      .select()
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.tenantId, user.tenantId),
          eq(businessDocuments.id, id),
          isNull(businessDocuments.voidedAt),
        ),
      )
      .limit(1);
    if (!doc) throw new Error('Document not found.');
    if (doc.transactionId) throw new Error('Posted documents cannot be edited here.');
    if (doc.status === 'converted' || doc.status === 'fully_invoiced') {
      throw new Error('Converted documents cannot be edited.');
    }

    await db()
      .update(businessDocuments)
      .set({
        status: status || doc.status,
        issueDate: /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate : doc.issueDate,
        dueDate: dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : dueDate === '' ? null : doc.dueDate,
        notes: notes || null,
        updatedAt: new Date(),
      })
      .where(eq(businessDocuments.id, id));
  });

  revalidatePath('/sales/quotations');
  revalidatePath('/sales/orders');
  const { redirect } = await import('next/navigation');
  const type = String(formData.get('documentType') ?? 'quotation');
  if (type === 'sales_order') redirect('/sales/orders?flash=saved');
  redirect('/sales/quotations?flash=saved');
}

