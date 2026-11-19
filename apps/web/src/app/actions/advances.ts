'use server';

import { revalidatePath } from 'next/cache';
import {
  TAXABLE_ADVANCE_REFUSAL,
  advanceOutstanding,
  canApplyAdvance,
  customerAdvanceApplyLines,
  customerAdvanceIssueLines,
  customerAdvanceRefundLines,
  moneyAmount,
  staffAdvanceExpenseLines,
  staffAdvanceIssueLines,
  staffAdvanceReturnLines,
  supplierAdvanceApplyLines,
  supplierAdvanceIssueLines,
  supplierAdvanceRefundLines,
  type AdvanceKind,
} from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  auditLog,
  businessDocuments,
  db,
  parties,
  partyAdvanceAllocations,
  partyAdvances,
  settlementAllocations,
  withTenantContext,
  and,
  eq,
  isNull,
  sql,
  desc,
  inArray,
} from '@bookone/db';
import { assertPermission } from '@/lib/access';
import { assertPeriodUnlocked, postBalancedJournal, resolveAccountByCode } from '@/lib/post-balanced-journal';

export type AdvanceActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function writeKey(kind: AdvanceKind): string {
  if (kind === 'customer') return 'sales.payments.write';
  if (kind === 'supplier') return 'purchase.payments.write';
  return 'accounting.simple_entry.write';
}

function remainingOf(row: {
  issuedAmount: string;
  appliedAmount: string;
  refundedAmount: string;
  expenseSettledAmount: string;
  returnedCashAmount: string;
}): number {
  return advanceOutstanding({
    kind: 'customer',
    issued: Number(row.issuedAmount),
    applied: Number(row.appliedAmount),
    refunded: Number(row.refundedAmount),
    expenseSettled: Number(row.expenseSettledAmount),
    returnedCash: Number(row.returnedCashAmount),
  });
}

async function loadParty(tenantId: string, partyId: string, kind: AdvanceKind) {
  const [party] = await db()
    .select({
      id: parties.id,
      name: parties.name,
      kind: parties.kind,
      isCustomer: parties.isCustomer,
      isVendor: parties.isVendor,
    })
    .from(parties)
    .where(and(eq(parties.tenantId, tenantId), eq(parties.id, partyId), isNull(parties.voidedAt)))
    .limit(1);
  if (!party) throw new Error('Party was not found.');
  if (kind === 'customer' && party.isCustomer !== '1' && party.kind !== 'customer') {
    throw new Error('Choose a customer for a customer advance.');
  }
  if (kind === 'supplier' && party.isVendor !== '1' && party.kind !== 'vendor') {
    throw new Error('Choose a supplier for a supplier advance.');
  }
  if (kind === 'staff' && party.kind !== 'staff') {
    throw new Error('Choose a staff party for a staff advance.');
  }
  return party;
}

const CUSTOMER_APPLY_TYPES = ['sales_invoice', 'pos_sale', 'customer_invoice'] as const;
const SUPPLIER_APPLY_TYPES = ['purchase', 'import_purchase', 'vendor_bill', 'cash_purchase'] as const;

export async function listAdvanceParties(): Promise<
  Array<{ id: string; name: string; kind: string; isCustomer: string; isVendor: string }>
> {
  await assertPermission('accounting.accounts.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: parties.id,
        name: parties.name,
        kind: parties.kind,
        isCustomer: parties.isCustomer,
        isVendor: parties.isVendor,
      })
      .from(parties)
      .where(and(eq(parties.tenantId, user.tenantId), isNull(parties.voidedAt)));
    return rows;
  });
}

export async function listOpenAdvanceDocuments(): Promise<
  Array<{ id: string; partyId: string; documentNumber: string; documentType: string; balanceDue: number }>
> {
  await assertPermission('accounting.accounts.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: businessDocuments.id,
        partyId: businessDocuments.partyId,
        documentNumber: businessDocuments.documentNumber,
        documentType: businessDocuments.documentType,
        balanceDue: businessDocuments.balanceDue,
      })
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.tenantId, user.tenantId),
          isNull(businessDocuments.voidedAt),
          inArray(businessDocuments.documentType, [...CUSTOMER_APPLY_TYPES, ...SUPPLIER_APPLY_TYPES]),
          sql`${businessDocuments.balanceDue}::numeric > 0`,
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      partyId: row.partyId,
      documentNumber: row.documentNumber,
      documentType: row.documentType,
      balanceDue: Number(row.balanceDue),
    }));
  });
}

export async function listPartyAdvances(kind?: AdvanceKind): Promise<
  Array<{
    id: string;
    kind: AdvanceKind;
    partyId: string;
    partyName: string;
    issuedOn: string;
    issued: number;
    remaining: number;
    status: string;
    version: number;
  }>
> {
  await assertPermission('accounting.accounts.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: partyAdvances.id,
        kind: partyAdvances.kind,
        partyId: partyAdvances.partyId,
        partyName: parties.name,
        issuedOn: partyAdvances.issuedOn,
        issuedAmount: partyAdvances.issuedAmount,
        appliedAmount: partyAdvances.appliedAmount,
        refundedAmount: partyAdvances.refundedAmount,
        expenseSettledAmount: partyAdvances.expenseSettledAmount,
        returnedCashAmount: partyAdvances.returnedCashAmount,
        status: partyAdvances.status,
        version: partyAdvances.version,
      })
      .from(partyAdvances)
      .innerJoin(parties, eq(parties.id, partyAdvances.partyId))
      .where(
        and(
          eq(partyAdvances.tenantId, user.tenantId),
          isNull(partyAdvances.voidedAt),
          kind ? eq(partyAdvances.kind, kind) : sql`true`,
        ),
      )
      .orderBy(desc(partyAdvances.createdAt));
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as AdvanceKind,
      partyId: row.partyId,
      partyName: row.partyName,
      issuedOn: row.issuedOn,
      issued: Number(row.issuedAmount),
      remaining: remainingOf(row),
      status: row.status,
      version: row.version,
    }));
  });
}

export async function issuePartyAdvance(input: {
  kind: AdvanceKind;
  partyId: string;
  amount: number;
  date: string;
  cashCode?: string;
  notes?: string;
  taxable?: boolean;
  idempotencyKey: string;
}): Promise<AdvanceActionResult<{ id: string; remaining: number }>> {
  try {
    if (input.taxable) return { ok: false, error: TAXABLE_ADVANCE_REFUSAL };
    await assertPermission(writeKey(input.kind), 'write');
    const user = await requireTenantContext();
    const amount = moneyAmount(input.amount);
    if (amount <= 0) return { ok: false, error: 'Amount must be greater than zero.' };
    return withTenantContext(user.tenantId, async () => {
      const locked = await assertPeriodUnlocked(user.tenantId, input.date);
      if (locked) return { ok: false, error: locked };
      const [existing] = await db()
        .select({ id: partyAdvances.id, issuedAmount: partyAdvances.issuedAmount })
        .from(partyAdvances)
        .where(and(eq(partyAdvances.tenantId, user.tenantId), eq(partyAdvances.idempotencyKey, input.idempotencyKey)))
        .limit(1);
      if (existing) {
        return { ok: true, data: { id: existing.id, remaining: Number(existing.issuedAmount) } };
      }
      const party = await loadParty(user.tenantId, input.partyId, input.kind);
      const cashCode = input.cashCode || '1000';
      const cash = await resolveAccountByCode(user.tenantId, cashCode);
      if (!cash) return { ok: false, error: `Cash/bank account ${cashCode} was not found.` };
      const controlCode = input.kind === 'customer' ? '2410' : input.kind === 'supplier' ? '1350' : '1360';
      const control = await resolveAccountByCode(user.tenantId, controlCode);
      if (!control) return { ok: false, error: `Advance account ${controlCode} is missing from this company chart.` };
      const lines =
        input.kind === 'customer'
          ? customerAdvanceIssueLines(amount, cashCode)
          : input.kind === 'supplier'
            ? supplierAdvanceIssueLines(amount, cashCode)
            : staffAdvanceIssueLines(amount, cashCode);
      const posted = await postBalancedJournal({
        tenantId: user.tenantId,
        userId: user.id,
        date: input.date,
        party: party.name,
        description: `${input.kind} advance ${amount.toFixed(2)}`,
        accountingType: input.kind === 'staff' ? 'expense' : 'transfer',
        direction: input.kind === 'customer' ? 'in' : 'out',
        paymentMethod: 'Bank',
        paymentAccountId: cash.id,
        lines,
        notes: input.notes ?? null,
        auditTable: 'party_advances',
      });
      const [row] = await db()
        .insert(partyAdvances)
        .values({
          tenantId: user.tenantId,
          partyId: party.id,
          kind: input.kind,
          accountId: control.id,
          cashAccountId: cash.id,
          status: 'open',
          issuedAmount: amount.toFixed(2),
          issuedOn: input.date,
          notes: input.notes ?? null,
          idempotencyKey: input.idempotencyKey,
          sourceTransactionId: posted.transactionId,
          sourceJournalId: posted.journalId,
          createdBy: user.id,
        })
        .returning({ id: partyAdvances.id });
      if (!row) throw new Error('Could not record the advance.');
      await db()
        .update(auditLog)
        .set({ recordId: row.id })
        .where(and(eq(auditLog.tenantId, user.tenantId), eq(auditLog.recordId, posted.transactionId), eq(auditLog.tableName, 'party_advances')));
      revalidatePath('/advances');
      revalidatePath('/accounts');
      return { ok: true, data: { id: row.id, remaining: amount } };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not issue the advance.' };
  }
}

export async function applyPartyAdvance(input: {
  advanceId: string;
  amount: number;
  documentId?: string;
  expenseCode?: string;
  kind: 'apply' | 'refund' | 'expense_settle' | 'return_cash';
  expectedVersion: number;
}): Promise<AdvanceActionResult<{ remaining: number }>> {
  try {
    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const [advance] = await db()
        .select()
        .from(partyAdvances)
        .where(and(eq(partyAdvances.tenantId, user.tenantId), eq(partyAdvances.id, input.advanceId), isNull(partyAdvances.voidedAt)))
        .limit(1);
      if (!advance) return { ok: false, error: 'Advance was not found.' };
      await assertPermission(writeKey(advance.kind as AdvanceKind), 'write');
      if (advance.version !== input.expectedVersion) {
        return { ok: false, error: 'This advance changed since you opened it. Reload and try again.' };
      }
      if (advance.kind === 'staff' && (input.kind === 'apply' || input.kind === 'refund')) {
        return { ok: false, error: 'Staff advances use expense settlement or unused cash return.' };
      }
      if (advance.kind !== 'staff' && (input.kind === 'expense_settle' || input.kind === 'return_cash')) {
        return { ok: false, error: 'Expense settlement and cash return are only for staff advances.' };
      }
      if (input.kind === 'apply' && !input.documentId) {
        return { ok: false, error: 'Choose the invoice or bill to apply this advance to.' };
      }
      const state = {
        kind: advance.kind as AdvanceKind,
        issued: Number(advance.issuedAmount),
        applied: Number(advance.appliedAmount),
        refunded: Number(advance.refundedAmount),
        expenseSettled: Number(advance.expenseSettledAmount),
        returnedCash: Number(advance.returnedCashAmount),
      };
      const check = canApplyAdvance(state, input.amount);
      if (!check.ok) return { ok: false, error: check.error };
      const amount = moneyAmount(input.amount);
      const locked = await assertPeriodUnlocked(user.tenantId, advance.issuedOn);
      if (locked) return { ok: false, error: locked };
      const [party] = await db()
        .select({ name: parties.name })
        .from(parties)
        .where(eq(parties.id, advance.partyId))
        .limit(1);
      const [cash] = await db()
        .select({ code: accounts.code })
        .from(accounts)
        .where(eq(accounts.id, advance.cashAccountId))
        .limit(1);
      const cashCode = cash?.code || '1000';
      let document: { id: string; partyId: string; balanceDue: string; paidAmount: string; transactionId: string | null; documentType: string } | null = null;
      if (input.kind === 'apply' && input.documentId) {
        const [doc] = await db()
          .select({
            id: businessDocuments.id,
            partyId: businessDocuments.partyId,
            balanceDue: businessDocuments.balanceDue,
            paidAmount: businessDocuments.paidAmount,
            transactionId: businessDocuments.transactionId,
            documentType: businessDocuments.documentType,
          })
          .from(businessDocuments)
          .where(
            and(
              eq(businessDocuments.tenantId, user.tenantId),
              eq(businessDocuments.id, input.documentId),
              isNull(businessDocuments.voidedAt),
            ),
          )
          .limit(1);
        if (!doc) return { ok: false, error: 'Document was not found.' };
        if (doc.partyId !== advance.partyId) return { ok: false, error: 'Advance and document belong to different parties.' };
        const allowed =
          advance.kind === 'customer'
            ? (CUSTOMER_APPLY_TYPES as readonly string[]).includes(doc.documentType)
            : (SUPPLIER_APPLY_TYPES as readonly string[]).includes(doc.documentType);
        if (!allowed) return { ok: false, error: 'That document cannot take this kind of advance.' };
        if (amount > Number(doc.balanceDue) + 0.005) {
          return { ok: false, error: 'Cannot apply more than the document balance.' };
        }
        document = doc;
      }
      const lines =
        input.kind === 'apply' && advance.kind === 'customer'
          ? customerAdvanceApplyLines(amount)
          : input.kind === 'apply' && advance.kind === 'supplier'
            ? supplierAdvanceApplyLines(amount)
            : input.kind === 'refund' && advance.kind === 'customer'
              ? customerAdvanceRefundLines(amount, cashCode)
              : input.kind === 'refund' && advance.kind === 'supplier'
                ? supplierAdvanceRefundLines(amount, cashCode)
                : input.kind === 'expense_settle'
                  ? staffAdvanceExpenseLines(amount, input.expenseCode || '6800')
                  : staffAdvanceReturnLines(amount, cashCode);
      const posted = await postBalancedJournal({
        tenantId: user.tenantId,
        userId: user.id,
        date: advance.issuedOn,
        party: party?.name || 'Advance',
        description: `${advance.kind} advance ${input.kind} ${amount.toFixed(2)}`,
        accountingType: 'transfer',
        direction: input.kind === 'refund' || input.kind === 'return_cash' ? 'in' : 'out',
        paymentMethod: 'Bank',
        paymentAccountId: advance.cashAccountId,
        lines,
        auditTable: 'party_advance_allocations',
      });
      await db().insert(partyAdvanceAllocations).values({
        tenantId: user.tenantId,
        advanceId: advance.id,
        kind: input.kind,
        amount: amount.toFixed(2),
        documentId: document?.id ?? null,
        transactionId: posted.transactionId,
        journalId: posted.journalId,
        createdBy: user.id,
      });
      const next = {
        appliedAmount: (Number(advance.appliedAmount) + (input.kind === 'apply' ? amount : 0)).toFixed(2),
        refundedAmount: (Number(advance.refundedAmount) + (input.kind === 'refund' ? amount : 0)).toFixed(2),
        expenseSettledAmount: (Number(advance.expenseSettledAmount) + (input.kind === 'expense_settle' ? amount : 0)).toFixed(2),
        returnedCashAmount: (Number(advance.returnedCashAmount) + (input.kind === 'return_cash' ? amount : 0)).toFixed(2),
      };
      const remaining = check.remaining;
      const [updated] = await db()
        .update(partyAdvances)
        .set({
          ...next,
          status: remaining < 0.005 ? 'closed' : 'open',
          version: advance.version + 1,
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(partyAdvances.id, advance.id), eq(partyAdvances.version, advance.version)))
        .returning({ id: partyAdvances.id });
      if (!updated) return { ok: false, error: 'This advance changed since you opened it. Reload and try again.' };
      if (document && input.kind === 'apply') {
        const paid = moneyAmount(Number(document.paidAmount) + amount);
        const due = moneyAmount(Number(document.balanceDue) - amount);
        await db()
          .update(businessDocuments)
          .set({
            paidAmount: paid.toFixed(2),
            balanceDue: due.toFixed(2),
            status: due < 0.005 ? 'paid' : 'partial',
            updatedAt: sql`NOW()`,
          })
          .where(eq(businessDocuments.id, document.id));
        if (document.transactionId) {
          await db().insert(settlementAllocations).values({
            tenantId: user.tenantId,
            paymentTransactionId: posted.transactionId,
            invoiceTransactionId: document.transactionId,
            allocatedAmount: amount.toFixed(2),
          });
        }
      }
      revalidatePath('/advances');
      revalidatePath('/accounts');
      return { ok: true, data: { remaining } };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not apply the advance.' };
  }
}
