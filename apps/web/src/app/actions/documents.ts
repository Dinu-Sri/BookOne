'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  isLiquidTenderCode,
  PAYMENT_OVER_BALANCE_MESSAGE,
  paymentAmountExceedsBalance,
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
  gte,
  lte,
  inArray,
  journalEntries,
  journalLines,
  parties,
  periodLocks,
  settlementAllocations,
  sql,
  transactions,
  pgClient,
  withTenantContext,
} from '@bookone/db';
import { ensureParty } from '@/app/actions/parties';
import { assertPermission } from '@/lib/access';
import { assertDimensionScope } from '@/lib/dimension-scope';

const documentTypeSchema = z.enum(['customer_invoice', 'vendor_bill', 'sales_invoice']);

const documentInputSchema = z.object({
  documentType: documentTypeSchema,
  partyName: z.string().min(1).max(255),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
  description: z.string().min(1).max(1000),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().positive(),
  accountCode: z.string().min(1).max(20),
  notes: z.string().max(1000).optional(),
});

const allocationInputSchema = z.object({
  documentId: z.string().uuid(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentAccountCode: z.string().min(1).max(20),
  amount: z.number().positive(),
});

export interface DocumentRow {
  id: string;
  documentType: 'customer_invoice' | 'vendor_bill';
  documentNumber: string;
  partyName: string;
  issueDate: string;
  dueDate: string | null;
  status: string;
  total: number;
  paidAmount: number;
  balanceDue: number;
  currency: string;
  description: string;
}

export interface DocumentSummary {
  documents: DocumentRow[];
  openReceivables: number;
  openPayables: number;
  overdueCount: number;
}

function parseMoney(value: FormDataEntryValue | null): number {
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

function documentPrefix(type: z.infer<typeof documentTypeSchema>) {
  return type === 'customer_invoice' ? 'INV' : 'BILL';
}

function documentDirection(type: z.infer<typeof documentTypeSchema>) {
  return type === 'customer_invoice' ? 'money_in' : 'money_out';
}

async function resolveAccount(tenantId: string, code: string) {
  const [account] = await db()
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      isActive: accounts.isActive,
    })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code), isNull(accounts.voidedAt)))
    .limit(1);
  if (!account) throw new Error(`Account ${code} not found.`);
  return account;
}

function assertEligiblePaymentTender(account: { code: string; type: string; isActive: string }) {
  if (account.type !== 'asset' || account.isActive !== '1' || !isLiquidTenderCode(account.code)) {
    throw new Error('Payment must use an active cash, bank, or card account.');
  }
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

async function nextDocumentNumber(tenantId: string, type: z.infer<typeof documentTypeSchema>, date: string) {
  const prefix = documentPrefix(type);
  const compactDate = date.replace(/-/g, '');
  const [{ total }] = await db()
    .select({ total: sql<number>`count(*)` })
    .from(businessDocuments)
    .where(
      and(
        eq(businessDocuments.tenantId, tenantId),
        eq(businessDocuments.documentType, type),
        gte(businessDocuments.issueDate, `${date.slice(0, 7)}-01`),
        lte(businessDocuments.issueDate, `${date.slice(0, 7)}-31`),
        isNull(businessDocuments.voidedAt),
      ),
    );
  return `${prefix}-${compactDate}-${String(Number(total ?? 0) + 1).padStart(4, '0')}`;
}

function toDocumentRow(row: {
  id: string;
  documentType: string;
  documentNumber: string;
  partyName: string | null;
  issueDate: string;
  dueDate: string | null;
  status: string;
  total: string;
  paidAmount: string;
  balanceDue: string;
  currency: string;
  description: string | null;
}): DocumentRow {
  return {
    id: row.id,
    documentType: row.documentType as DocumentRow['documentType'],
    documentNumber: row.documentNumber,
    partyName: row.partyName ?? 'Unknown party',
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    status: row.status,
    total: Number(row.total),
    paidAmount: Number(row.paidAmount),
    balanceDue: Number(row.balanceDue),
    currency: row.currency,
    description: row.description ?? '',
  };
}

export async function listDocuments(period?: string): Promise<DocumentSummary> {
  const user = await requireTenantContext();
  const { resolvePeriodBounds } = await import('@/lib/period-range');
  const periodBounds = resolvePeriodBounds(period ?? 'all');

  return withTenantContext(user.tenantId, async () => {
    const conditions = [eq(businessDocuments.tenantId, user.tenantId), isNull(businessDocuments.voidedAt)];
    if (periodBounds.from && periodBounds.to) {
      conditions.push(gte(businessDocuments.issueDate, periodBounds.from));
      conditions.push(lte(businessDocuments.issueDate, periodBounds.to));
    }

    const rows = await db()
      .select({
        id: businessDocuments.id,
        documentType: businessDocuments.documentType,
        documentNumber: businessDocuments.documentNumber,
        partyName: parties.name,
        issueDate: businessDocuments.issueDate,
        dueDate: businessDocuments.dueDate,
        status: businessDocuments.status,
        total: businessDocuments.total,
        paidAmount: businessDocuments.paidAmount,
        balanceDue: businessDocuments.balanceDue,
        currency: businessDocuments.currency,
        description: businessDocumentLines.description,
      })
      .from(businessDocuments)
      .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
      .leftJoin(businessDocumentLines, eq(businessDocumentLines.documentId, businessDocuments.id))
      .where(and(...conditions))
      .orderBy(desc(businessDocuments.issueDate), desc(businessDocuments.createdAt));

    const documents = rows.map(toDocumentRow);
    const today = new Date().toISOString().slice(0, 10);
    return {
      documents,
      openReceivables: documents
        .filter((doc) => doc.documentType === 'customer_invoice')
        .reduce((sum, doc) => sum + doc.balanceDue, 0),
      openPayables: documents
        .filter((doc) => doc.documentType === 'vendor_bill')
        .reduce((sum, doc) => sum + doc.balanceDue, 0),
      overdueCount: documents.filter((doc) => doc.status !== 'paid' && doc.dueDate && doc.dueDate < today).length,
    };
  });
}

export async function createDocument(input: z.infer<typeof documentInputSchema>): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = documentInputSchema.parse(input);
    const user = await requireTenantContext();
    const party = await ensureParty({
      name: parsed.partyName,
      kind: parsed.documentType === 'customer_invoice' ? 'customer' : 'vendor',
    });

    await withTenantContext(user.tenantId, async () => {
      await assertOpenPeriod(user.tenantId, parsed.issueDate);
      const total = parsed.quantity * parsed.unitPrice;
      const controlAccount = await resolveAccount(user.tenantId, parsed.documentType === 'customer_invoice' ? '1300' : '2100');
      const lineAccount = await resolveAccount(user.tenantId, parsed.accountCode);
      const documentNumber = await nextDocumentNumber(user.tenantId, parsed.documentType, parsed.issueDate);

      await db().transaction(async (tx) => {
        const [createdTx] = await tx
          .insert(transactions)
          .values({
            tenantId: user.tenantId,
            userId: user.id,
            accountingType: 'invoice_bill',
            direction: documentDirection(parsed.documentType),
            party: party.name,
            description: `${documentNumber}: ${parsed.description}`.slice(0, 1000),
            amount: total.toFixed(2),
            currency: 'LKR',
            paymentMethod: 'Credit',
            paymentAccountId: controlAccount.id,
            date: parsed.issueDate,
            categoryCode: lineAccount.code,
            categoryName: lineAccount.name,
            categoryConfidence: '1.00',
            categorySource: 'document',
            invoiceRef: documentNumber,
            isAlreadySettled: '0',
            notes: parsed.notes ?? null,
          })
          .returning({ id: transactions.id });

        const [journal] = await tx
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

        const debitAccount = parsed.documentType === 'customer_invoice' ? controlAccount : lineAccount;
        const creditAccount = parsed.documentType === 'customer_invoice' ? lineAccount : controlAccount;
        await tx.insert(journalLines).values([
          {
            tenantId: user.tenantId,
            journalEntryId: journal.id,
            accountId: debitAccount.id,
            side: 'debit',
            amount: total.toFixed(2),
            memo: parsed.description,
          },
          {
            tenantId: user.tenantId,
            journalEntryId: journal.id,
            accountId: creditAccount.id,
            side: 'credit',
            amount: total.toFixed(2),
            memo: parsed.description,
          },
        ]);

        const [document] = await tx
          .insert(businessDocuments)
          .values({
            tenantId: user.tenantId,
            userId: user.id,
            partyId: party.id,
            transactionId: createdTx.id,
            documentType: parsed.documentType,
            documentNumber,
            issueDate: parsed.issueDate,
            dueDate: parsed.dueDate || null,
            status: 'open',
            subtotal: total.toFixed(2),
            taxTotal: '0',
            total: total.toFixed(2),
            paidAmount: '0',
            balanceDue: total.toFixed(2),
            currency: 'LKR',
            notes: parsed.notes ?? null,
          })
          .returning({ id: businessDocuments.id });

        await tx.insert(businessDocumentLines).values({
          tenantId: user.tenantId,
          documentId: document.id,
          accountId: lineAccount.id,
          description: parsed.description,
          quantity: parsed.quantity.toFixed(2),
          unitPrice: parsed.unitPrice.toFixed(2),
          lineTotal: total.toFixed(2),
        });

        await tx.insert(auditLog).values({
          tenantId: user.tenantId,
          userId: user.id,
          action: 'CREATE',
          tableName: 'business_documents',
          recordId: document.id,
          newValues: { documentNumber, documentType: parsed.documentType, total },
          notes: 'Created AR/AP document and posted journal.',
        });
      });
    });

    revalidatePath('/documents');
    revalidatePath('/transactions');
    revalidatePath('/journal');
    revalidatePath('/reports');
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create document.';
    return { ok: false, error: message };
  }
}

export async function createDocumentFromForm(formData: FormData): Promise<void> {
  await createDocument({
    documentType: String(formData.get('documentType') ?? 'customer_invoice') as z.infer<typeof documentTypeSchema>,
    partyName: String(formData.get('partyName') ?? ''),
    issueDate: String(formData.get('issueDate') ?? new Date().toISOString().slice(0, 10)),
    dueDate: String(formData.get('dueDate') ?? ''),
    description: String(formData.get('description') ?? ''),
    quantity: parseMoney(formData.get('quantity')) || 1,
    unitPrice: parseMoney(formData.get('unitPrice')),
    accountCode: String(formData.get('accountCode') ?? '4000'),
    notes: String(formData.get('notes') ?? ''),
  });
}

type AllocateTx = {
  select: ReturnType<typeof db>['select'];
  insert: ReturnType<typeof db>['insert'];
  update: ReturnType<typeof db>['update'];
};

async function lockDocumentsForUpdate(tenantId: string, documentIds: string[]): Promise<void> {
  const ids = [...new Set(documentIds.filter(Boolean))].sort();
  for (const id of ids) {
    await pgClient()`
      select id from business_documents
      where id = ${id}::uuid and tenant_id = ${tenantId}::uuid
      for update
    `;
  }
}

async function allocateDocumentPaymentBody(
  tx: AllocateTx,
  user: { id: string; tenantId: string },
  parsed: { documentId: string; paymentDate: string; paymentAccountCode: string; amount: number },
): Promise<string> {
  await pgClient()`
    select id from business_documents
    where id = ${parsed.documentId}::uuid and tenant_id = ${user.tenantId}::uuid
    for update
  `;

  const [document] = await tx
    .select({
      id: businessDocuments.id,
      documentType: businessDocuments.documentType,
      documentNumber: businessDocuments.documentNumber,
      partyName: parties.name,
      transactionId: businessDocuments.transactionId,
      postedAt: businessDocuments.postedAt,
      brandId: businessDocuments.brandId,
      locationId: businessDocuments.locationId,
      total: businessDocuments.total,
      paidAmount: businessDocuments.paidAmount,
      balanceDue: businessDocuments.balanceDue,
    })
    .from(businessDocuments)
    .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
    .where(
      and(
        eq(businessDocuments.tenantId, user.tenantId),
        eq(businessDocuments.id, parsed.documentId),
        isNull(businessDocuments.voidedAt),
      ),
    )
    .limit(1);

  if (!document) throw new Error('Document not found.');
  if (!document.transactionId || !document.postedAt) {
    throw new Error('Document has no posted transaction to allocate against.');
  }
  const arTypes = new Set(['customer_invoice', 'sales_invoice', 'pos_sale']);
  const apTypes = new Set(['purchase', 'import_purchase', 'vendor_bill']);
  const isInvoice = arTypes.has(document.documentType);
  const isApBill = apTypes.has(document.documentType);
  if (!isInvoice && !isApBill) {
    throw new Error('Payments can only be allocated to sales invoices or purchase bills.');
  }
  await assertPermission(isInvoice ? 'sales.payments.write' : 'purchase.payments.write', 'write');
  await assertDimensionScope({ locationId: document.locationId, brandId: document.brandId });
  const balanceDue = Number(document.balanceDue);
  if (paymentAmountExceedsBalance(parsed.amount, balanceDue)) {
    throw new Error(PAYMENT_OVER_BALANCE_MESSAGE);
  }

  const paymentAccount = await resolveAccount(user.tenantId, parsed.paymentAccountCode);
  assertEligiblePaymentTender(paymentAccount);
  const controlAccount = await resolveAccount(user.tenantId, isInvoice ? '1300' : '2100');

  const [paymentTx] = await tx
    .insert(transactions)
    .values({
      tenantId: user.tenantId,
      userId: user.id,
      accountingType: 'payment',
      direction: isInvoice ? 'money_in' : 'money_out',
      party: document.partyName ?? 'Unknown party',
      description: `Payment for ${document.documentNumber}`,
      amount: parsed.amount.toFixed(2),
      currency: 'LKR',
      paymentMethod: paymentAccount.code === '1000' ? 'Cash' : paymentAccount.code === '1200' ? 'Card' : 'Bank',
      paymentAccountId: paymentAccount.id,
      date: parsed.paymentDate,
      categoryCode: controlAccount.code,
      categoryName: controlAccount.name,
      categoryConfidence: '1.00',
      categorySource: 'allocation',
      invoiceRef: document.documentNumber,
      isAlreadySettled: '1',
    })
    .returning({ id: transactions.id });

  const [journal] = await tx
    .insert(journalEntries)
    .values({
      tenantId: user.tenantId,
      userId: user.id,
      transactionId: paymentTx.id,
      memo: `Payment allocation ${document.documentNumber}`,
      entryDate: parsed.paymentDate,
      isBalanced: '1',
    })
    .returning({ id: journalEntries.id });

  await tx.insert(journalLines).values([
    {
      tenantId: user.tenantId,
      journalEntryId: journal.id,
      accountId: isInvoice ? paymentAccount.id : controlAccount.id,
      side: 'debit',
      amount: parsed.amount.toFixed(2),
      memo: `Payment for ${document.documentNumber}`,
    },
    {
      tenantId: user.tenantId,
      journalEntryId: journal.id,
      accountId: isInvoice ? controlAccount.id : paymentAccount.id,
      side: 'credit',
      amount: parsed.amount.toFixed(2),
      memo: `Payment for ${document.documentNumber}`,
    },
  ]);

  await tx.insert(settlementAllocations).values({
    tenantId: user.tenantId,
    paymentTransactionId: paymentTx.id,
    invoiceTransactionId: document.transactionId as string,
    allocatedAmount: parsed.amount.toFixed(2),
  });

  const newPaid = Number(document.paidAmount) + parsed.amount;
  const newBalance = Math.max(0, Number(document.total) - newPaid);
  await tx
    .update(businessDocuments)
    .set({
      paidAmount: newPaid.toFixed(2),
      balanceDue: newBalance.toFixed(2),
      status: newBalance <= 0.005 ? 'paid' : 'partial',
      updatedAt: new Date(),
    })
    .where(and(eq(businessDocuments.tenantId, user.tenantId), eq(businessDocuments.id, document.id)));

  await tx.insert(auditLog).values({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'ALLOCATE',
    tableName: 'settlement_allocations',
    recordId: paymentTx.id,
    newValues: { documentId: document.id, paymentTransactionId: paymentTx.id, amount: parsed.amount },
    notes: 'Allocated payment to AR/AP document.',
  });
  return paymentTx.id;
}

function revalidatePaymentPaths() {
  revalidatePath('/documents');
  revalidatePath('/transactions');
  revalidatePath('/journal');
  revalidatePath('/reports');
  revalidatePath('/purchase/purchases');
  revalidatePath('/purchase/import');
  revalidatePath('/purchase/payments');
  revalidatePath('/sales/invoices');
  revalidatePath('/sales/payments');
  revalidatePath('/sales/aging');
}

export async function allocateDocumentPayment(input: z.infer<typeof allocationInputSchema>): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = allocationInputSchema.parse(input);
    const user = await requireTenantContext();

    await withTenantContext(user.tenantId, async () => {
      await assertOpenPeriod(user.tenantId, parsed.paymentDate);
      await db().transaction(async (tx) => {
        await allocateDocumentPaymentBody(tx as AllocateTx, user, parsed);
      });
    });

    revalidatePaymentPaths();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not allocate payment.';
    return { ok: false, error: message };
  }
}

export async function allocateDocumentPaymentFromForm(formData: FormData): Promise<void> {
  const result = await allocateDocumentPayment({
    documentId: String(formData.get('documentId') ?? ''),
    paymentDate: String(formData.get('paymentDate') ?? new Date().toISOString().slice(0, 10)),
    paymentAccountCode: String(formData.get('paymentAccountCode') ?? '1100'),
    amount: parseMoney(formData.get('amount')),
  });
  if (!result.ok) {
    throw new Error(result.error ?? 'Payment failed');
  }
}

async function allocatePaymentBatch(args: {
  user: { id: string; tenantId: string };
  paymentDate: string;
  paymentAccountCode: string;
  allocations: { documentId: string; amount: number }[];
}): Promise<{ paidCount: number; paymentIds: string[] }> {
  await assertOpenPeriod(args.user.tenantId, args.paymentDate);
  const paymentIds: string[] = [];
  await db().transaction(async (tx) => {
    await lockDocumentsForUpdate(
      args.user.tenantId,
      args.allocations.map((row) => row.documentId),
    );
    for (const row of args.allocations) {
      const paymentId = await allocateDocumentPaymentBody(tx as AllocateTx, args.user, {
        documentId: row.documentId,
        paymentDate: args.paymentDate,
        paymentAccountCode: args.paymentAccountCode,
        amount: row.amount,
      });
      paymentIds.push(paymentId);
    }
  });
  return { paidCount: args.allocations.length, paymentIds };
}

/** Pay one or more AP bills in one transaction (same bank account / date). */
export async function payVendorBills(input: {
  paymentDate: string;
  paymentAccountCode: string;
  allocations: { documentId: string; amount: number }[];
}): Promise<{ ok: boolean; error?: string; paidCount?: number; paymentIds?: string[] }> {
  try {
    const { assertPermission } = await import('@/lib/access');
    await assertPermission('purchase.payments.write', 'write');
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(input.paymentDate);
    const account = z.string().min(1).max(20).parse(input.paymentAccountCode);
    const allocations = input.allocations.filter((a) => a.amount > 0);
    if (allocations.length === 0) return { ok: false, error: 'Select at least one bill with an amount.', paidCount: 0 };

    const user = await requireTenantContext();
    const batch = await withTenantContext(user.tenantId, () =>
      allocatePaymentBatch({
        user,
        paymentDate: date,
        paymentAccountCode: account,
        allocations,
      }),
    );
    revalidatePaymentPaths();
    return { ok: true, paidCount: batch.paidCount, paymentIds: batch.paymentIds };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Pay vendors failed.', paidCount: 0 };
  }
}

/**
 * Receive customer payments against open AR invoices (QBO “Receive payment”).
 * Dr Cash/Bank · Cr AR 1300 per allocation. The whole batch is one transaction.
 */
export async function receiveCustomerPayments(input: {
  paymentDate: string;
  paymentAccountCode: string;
  allocations: { documentId: string; amount: number }[];
  idempotencyKey?: string | null;
}): Promise<{ ok: boolean; error?: string; paidCount?: number; paymentIds?: string[] }> {
  const started = Date.now();
  let tenantId: string | undefined;
  let key: string | null | undefined = input.idempotencyKey;
  let fingerprint = '';
  const { writeIdempotency } = await import('@/lib/idempotency');
  const persist = async (out: { ok: boolean; error?: string; paidCount?: number; fingerprint?: string }) => {
    if (!tenantId) return out;
    await withTenantContext(tenantId, () => writeIdempotency(tenantId!, key, out));
    return out;
  };
  try {
    const { assertPermission } = await import('@/lib/access');
    await assertPermission('sales.payments.write', 'write');
    const { requireTenantContext } = await import('@bookone/auth');
    const user = await requireTenantContext();
    tenantId = user.tenantId;
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(input.paymentDate);
    const account = z.string().min(1).max(20).parse(input.paymentAccountCode);
    const allocations = input.allocations.filter((a) => a.amount > 0);
    const { paymentFingerprintConflicts, paymentOperationFingerprint } = await import(
      '@/lib/payment-idempotency'
    );
    fingerprint = paymentOperationFingerprint({
      paymentDate: date,
      paymentAccountCode: account,
      allocations,
    });
    const { claimIdempotency } = await import('@/lib/idempotency');
    const claim = await withTenantContext(user.tenantId, () =>
      claimIdempotency(user.tenantId, input.idempotencyKey),
    );
    if (claim.state === 'done') {
      if (paymentFingerprintConflicts(claim.result, fingerprint)) {
        return { ok: false, error: 'This payment key was already used for a different operation.' };
      }
      return claim.result as { ok: boolean; paidCount?: number };
    }
    if (claim.state === 'busy') return { ok: false, error: 'This payment is already running. Wait a moment.' };
    if (allocations.length === 0) {
      return persist({
        ok: false,
        error: 'Select at least one invoice with an amount.',
        paidCount: 0,
        fingerprint,
      });
    }

    const batch = await withTenantContext(user.tenantId, () =>
      allocatePaymentBatch({
        user,
        paymentDate: date,
        paymentAccountCode: account,
        allocations,
      }),
    );
    revalidatePaymentPaths();
    const out = {
      ok: true as const,
      paidCount: batch.paidCount,
      paymentIds: batch.paymentIds,
      fingerprint,
    };
    await persist(out);
    const { logIfSlow } = await import('@/lib/ops-log');
    await logIfSlow('action:receiveCustomerPayments', started, {
      status: 'ok',
      message: String(batch.paidCount),
    });
    return out;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Receive payment failed.';
    const { logOps } = await import('@/lib/ops-log');
    await logOps({ kind: 'error', path: 'action:receiveCustomerPayments', status: 'error', message });
    return persist({ ok: false, error: message, paidCount: 0, fingerprint: fingerprint || undefined });
  }
}

export type PaymentPrintFacts = {
  date: string;
  account: string;
  partyName: string;
  rows: { number: string; partyName: string; amount: number }[];
  total: number;
};

/** Load remittance/receipt rows from persisted payment allocations. Query amounts are ignored. */
export async function loadPaymentPrintFacts(paymentIds: string[]): Promise<PaymentPrintFacts | null> {
  const ids = [...new Set(paymentIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (ids.length === 0) return null;
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const pays = await db()
      .select({
        id: transactions.id,
        date: transactions.date,
        party: transactions.party,
        accountCode: accounts.code,
        accountName: accounts.name,
      })
      .from(transactions)
      .leftJoin(accounts, eq(accounts.id, transactions.paymentAccountId))
      .where(
        and(
          eq(transactions.tenantId, user.tenantId),
          inArray(transactions.id, ids),
          eq(transactions.accountingType, 'payment'),
          isNull(transactions.voidedAt),
        ),
      );
    if (pays.length === 0) return null;

    const allocs = await db()
      .select({
        paymentTransactionId: settlementAllocations.paymentTransactionId,
        allocatedAmount: settlementAllocations.allocatedAmount,
        documentNumber: businessDocuments.documentNumber,
        partyName: parties.name,
      })
      .from(settlementAllocations)
      .innerJoin(
        businessDocuments,
        eq(businessDocuments.transactionId, settlementAllocations.invoiceTransactionId),
      )
      .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
      .where(
        and(
          eq(settlementAllocations.tenantId, user.tenantId),
          inArray(settlementAllocations.paymentTransactionId, ids),
          isNull(settlementAllocations.voidedAt),
          isNull(businessDocuments.voidedAt),
        ),
      );

    const rows = allocs.map((a) => ({
      number: a.documentNumber,
      partyName: a.partyName ?? 'Unknown',
      amount: Number(a.allocatedAmount) || 0,
    }));
    const total = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    const first = pays[0]!;
    const account =
      first.accountCode && first.accountName
        ? `${first.accountCode} — ${first.accountName}`
        : first.accountCode || '—';
    const partyName = rows[0]?.partyName ?? first.party;
    const allSame = rows.every((r) => r.partyName === partyName);
    return {
      date: first.date,
      account,
      partyName: allSame ? partyName : rows.length ? 'Multiple' : partyName,
      rows,
      total,
    };
  });
}

export async function getDocumentFormOptions(): Promise<{
  revenueAccounts: { code: string; name: string }[];
  expenseAccounts: { code: string; name: string }[];
  paymentAccounts: { code: string; name: string }[];
}> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        code: accounts.code,
        name: accounts.name,
        type: accounts.type,
        isActive: accounts.isActive,
      })
      .from(accounts)
      .where(and(eq(accounts.tenantId, user.tenantId), isNull(accounts.voidedAt)))
      .orderBy(asc(accounts.code));
    return {
      revenueAccounts: rows.filter((row) => row.type === 'revenue').map(({ code, name }) => ({ code, name })),
      expenseAccounts: rows.filter((row) => row.type === 'expense').map(({ code, name }) => ({ code, name })),
      paymentAccounts: rows
        .filter(
          (row) => row.type === 'asset' && row.isActive === '1' && isLiquidTenderCode(row.code),
        )
        .map(({ code, name }) => ({ code, name })),
    };
  });
}
