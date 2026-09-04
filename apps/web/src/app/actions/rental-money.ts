'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  and,
  auditLog,
  businessDocumentLines,
  businessDocuments,
  db,
  eq,
  isNull,
  journalEntries,
  journalLines,
  parties,
  periodLocks,
  rentalEvents,
  sql,
  transactions,
  withTenantContext,
} from '@bookone/db';
import { getRentalSettings } from '@/app/actions/rental-settings';
import { suggestedEventDeposit } from '@/lib/rental-core';

function money(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function depositOpen(row: { depositHeld: string | number; depositApplied: string | number; depositRefunded: string | number }) {
  return money(Number(row.depositHeld) - Number(row.depositApplied) - Number(row.depositRefunded));
}

async function accountByCode(tenantId: string, code: string) {
  const [row] = await db()
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code), isNull(accounts.voidedAt)))
    .limit(1);
  if (!row) throw new Error(`Account ${code} is missing from the chart of accounts.`);
  return row;
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

function revalidateMoney(documentId: string) {
  revalidatePath('/inventory/on-rent');
  revalidatePath('/sales/invoices');
  revalidatePath(`/sales/invoices/${documentId}`);
  revalidatePath('/journal');
}

async function postBalanced(params: {
  tenantId: string;
  userId: string;
  party: string;
  description: string;
  amount: number;
  date: string;
  paymentAccountId: string;
  debitAccountId: string;
  creditAccountId: string;
  categoryCode: string;
  categoryName: string;
  direction: 'money_in' | 'money_out';
  invoiceRef?: string;
}): Promise<string> {
  const amount = money(params.amount).toFixed(2);
  const [txRow] = await db()
    .insert(transactions)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      accountingType: 'payment',
      direction: params.direction,
      party: params.party,
      description: params.description,
      amount,
      currency: 'LKR',
      paymentMethod: 'Bank',
      paymentAccountId: params.paymentAccountId,
      date: params.date,
      categoryCode: params.categoryCode,
      categoryName: params.categoryName,
      categoryConfidence: '1.00',
      categorySource: 'rental',
      invoiceRef: params.invoiceRef ?? null,
      isAlreadySettled: '1',
    })
    .returning({ id: transactions.id });
  const [journal] = await db()
    .insert(journalEntries)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      transactionId: txRow.id,
      memo: params.description,
      entryDate: params.date,
      isBalanced: '1',
    })
    .returning({ id: journalEntries.id });
  await db().insert(journalLines).values([
    {
      tenantId: params.tenantId,
      journalEntryId: journal.id,
      accountId: params.debitAccountId,
      side: 'debit',
      amount,
      memo: params.description,
    },
    {
      tenantId: params.tenantId,
      journalEntryId: journal.id,
      accountId: params.creditAccountId,
      side: 'credit',
      amount,
      memo: params.description,
    },
  ]);
  await db().insert(auditLog).values({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'CREATE',
    tableName: 'transactions',
    recordId: txRow.id,
    notes: params.description,
  });
  return txRow.id;
}

export type RentalMoneyState = {
  documentId: string;
  documentNumber: string;
  partyName: string;
  depositHeld: number;
  depositApplied: number;
  depositRefunded: number;
  depositOpen: number;
  suggestedDeposit: number;
  defaultLateFeePerDay: number;
  paymentAccounts: { code: string; name: string }[];
};

export async function getRentalMoneyState(documentId: string): Promise<RentalMoneyState | null> {
  const user = await requireTenantContext();
  const settings = await getRentalSettings();
  return withTenantContext(user.tenantId, async () => {
    const [doc] = await db()
      .select({
        id: businessDocuments.id,
        documentNumber: businessDocuments.documentNumber,
        partyName: parties.name,
      })
      .from(businessDocuments)
      .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
      .where(
        and(
          eq(businessDocuments.tenantId, user.tenantId),
          eq(businessDocuments.id, documentId),
          isNull(businessDocuments.voidedAt),
        ),
      )
      .limit(1);
    if (!doc) return null;

    const [event] = await db()
      .select()
      .from(rentalEvents)
      .where(
        and(
          eq(rentalEvents.tenantId, user.tenantId),
          eq(rentalEvents.documentId, documentId),
          isNull(rentalEvents.voidedAt),
        ),
      )
      .limit(1);

    const lines = await db()
      .select({
        productId: businessDocumentLines.productId,
        quantity: businessDocumentLines.quantity,
        unitPrice: businessDocumentLines.unitPrice,
        lineTotal: businessDocumentLines.lineTotal,
      })
      .from(businessDocumentLines)
      .where(
        and(eq(businessDocumentLines.documentId, documentId), isNull(businessDocumentLines.voidedAt)),
      );

    const { inventoryProducts } = await import('@bookone/db');
    let hireTotal = 0;
    let itemDeposits = 0;
    for (const line of lines) {
      if (!line.productId) continue;
      const [product] = await db()
        .select({
          productType: inventoryProducts.productType,
          depositAmount: inventoryProducts.depositAmount,
        })
        .from(inventoryProducts)
        .where(eq(inventoryProducts.id, line.productId))
        .limit(1);
      if (product?.productType !== 'rental') continue;
      hireTotal += Number(line.lineTotal);
      itemDeposits += Number(product.depositAmount ?? 0) * Number(line.quantity);
    }

    const suggested = suggestedEventDeposit({
      mode: settings.defaultDepositMode,
      eventAmount: Number(settings.defaultEventDepositAmount),
      eventPercent: Number(settings.defaultEventDepositPercent),
      hireTotal,
      itemDeposits,
    });

    const payAccounts = await db()
      .select({ code: accounts.code, name: accounts.name })
      .from(accounts)
      .where(
        and(
          eq(accounts.tenantId, user.tenantId),
          isNull(accounts.voidedAt),
          sql`${accounts.code} in ('1000','1100','1200')`,
        ),
      );

    const held = Number(event?.depositHeld ?? 0);
    const applied = Number(event?.depositApplied ?? 0);
    const refunded = Number(event?.depositRefunded ?? 0);

    return {
      documentId: doc.id,
      documentNumber: doc.documentNumber,
      partyName: doc.partyName ?? 'Customer',
      depositHeld: money(held),
      depositApplied: money(applied),
      depositRefunded: money(refunded),
      depositOpen: money(held - applied - refunded),
      suggestedDeposit: suggested,
      defaultLateFeePerDay: Number(settings.defaultLateFeePerDay),
      paymentAccounts:
        payAccounts.length > 0
          ? payAccounts
          : [
              { code: '1100', name: 'Bank' },
              { code: '1000', name: 'Cash' },
            ],
    };
  });
}

export async function collectRentalDeposit(input: {
  documentId: string;
  amount: number;
  paymentAccountCode?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const amount = money(input.amount);
    if (amount <= 0) return { ok: false, error: 'Enter a deposit amount.' };
    const user = await requireTenantContext();
    const today = new Date().toISOString().slice(0, 10);
    await withTenantContext(user.tenantId, async () => {
      await assertOpenPeriod(user.tenantId, today);
      const [doc] = await db()
        .select({
          id: businessDocuments.id,
          documentNumber: businessDocuments.documentNumber,
          partyName: parties.name,
        })
        .from(businessDocuments)
        .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
        .where(and(eq(businessDocuments.id, input.documentId), eq(businessDocuments.tenantId, user.tenantId)))
        .limit(1);
      if (!doc) throw new Error('Document not found.');
      const [event] = await db()
        .select()
        .from(rentalEvents)
        .where(
          and(
            eq(rentalEvents.documentId, input.documentId),
            eq(rentalEvents.tenantId, user.tenantId),
            isNull(rentalEvents.voidedAt),
          ),
        )
        .limit(1);
      if (!event) throw new Error('This document has no hire event yet. Save hire dates first.');
      const bank = await accountByCode(user.tenantId, input.paymentAccountCode || '1100');
      const liability = await accountByCode(user.tenantId, '2400');
      await postBalanced({
        tenantId: user.tenantId,
        userId: user.id,
        party: doc.partyName ?? 'Customer',
        description: `Hire deposit ${doc.documentNumber}`,
        amount,
        date: today,
        paymentAccountId: bank.id,
        debitAccountId: bank.id,
        creditAccountId: liability.id,
        categoryCode: '2400',
        categoryName: liability.name,
        direction: 'money_in',
        invoiceRef: doc.documentNumber,
      });
      await db()
        .update(rentalEvents)
        .set({
          depositHeld: (Number(event.depositHeld) + amount).toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(rentalEvents.id, event.id));
    });
    revalidateMoney(input.documentId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not collect deposit.' };
  }
}

export async function refundRentalDeposit(input: {
  documentId: string;
  amount: number;
  paymentAccountCode?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const amount = money(input.amount);
    if (amount <= 0) return { ok: false, error: 'Enter a refund amount.' };
    const user = await requireTenantContext();
    const today = new Date().toISOString().slice(0, 10);
    await withTenantContext(user.tenantId, async () => {
      await assertOpenPeriod(user.tenantId, today);
      const [doc] = await db()
        .select({
          id: businessDocuments.id,
          documentNumber: businessDocuments.documentNumber,
          partyName: parties.name,
        })
        .from(businessDocuments)
        .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
        .where(and(eq(businessDocuments.id, input.documentId), eq(businessDocuments.tenantId, user.tenantId)))
        .limit(1);
      if (!doc) throw new Error('Document not found.');
      const [event] = await db()
        .select()
        .from(rentalEvents)
        .where(
          and(
            eq(rentalEvents.documentId, input.documentId),
            eq(rentalEvents.tenantId, user.tenantId),
            isNull(rentalEvents.voidedAt),
          ),
        )
        .limit(1);
      if (!event) throw new Error('No hire event on this document.');
      const open = depositOpen(event);
      if (amount > open + 0.005) throw new Error(`Refund ${amount} is more than open deposit ${open}.`);
      const bank = await accountByCode(user.tenantId, input.paymentAccountCode || '1100');
      const liability = await accountByCode(user.tenantId, '2400');
      await postBalanced({
        tenantId: user.tenantId,
        userId: user.id,
        party: doc.partyName ?? 'Customer',
        description: `Hire deposit refund ${doc.documentNumber}`,
        amount,
        date: today,
        paymentAccountId: bank.id,
        debitAccountId: liability.id,
        creditAccountId: bank.id,
        categoryCode: '2400',
        categoryName: liability.name,
        direction: 'money_out',
        invoiceRef: doc.documentNumber,
      });
      await db()
        .update(rentalEvents)
        .set({
          depositRefunded: (Number(event.depositRefunded) + amount).toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(rentalEvents.id, event.id));
    });
    revalidateMoney(input.documentId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not refund deposit.' };
  }
}

export async function invoiceHireCharges(input: {
  documentId: string;
  damageCharge?: number;
  lateFee?: number;
  extraHire?: number;
  applyDeposit?: boolean;
}): Promise<{ ok: boolean; error?: string; invoiceId?: string }> {
  try {
    const damageCharge = money(input.damageCharge ?? 0);
    const lateFee = money(input.lateFee ?? 0);
    const extraHire = money(input.extraHire ?? 0);
    if (damageCharge + lateFee + extraHire <= 0) {
      return { ok: false, error: 'Enter a damage, late-fee, or extra hire amount.' };
    }
    const user = await requireTenantContext();
    const today = new Date().toISOString().slice(0, 10);

    const { createCommercialDocument } = await import('@/app/actions/commercial-docs');
    const ctx = await withTenantContext(user.tenantId, async () => {
      const [doc] = await db()
        .select({
          id: businessDocuments.id,
          documentNumber: businessDocuments.documentNumber,
          partyName: parties.name,
        })
        .from(businessDocuments)
        .leftJoin(parties, eq(parties.id, businessDocuments.partyId))
        .where(and(eq(businessDocuments.id, input.documentId), eq(businessDocuments.tenantId, user.tenantId)))
        .limit(1);
      if (!doc) throw new Error('Document not found.');
      const [event] = await db()
        .select()
        .from(rentalEvents)
        .where(
          and(
            eq(rentalEvents.documentId, input.documentId),
            eq(rentalEvents.tenantId, user.tenantId),
            isNull(rentalEvents.voidedAt),
          ),
        )
        .limit(1);
      return { doc, event };
    });

    const lines: { description: string; quantity: number; unitPrice: number; accountCode: string }[] = [];
    if (damageCharge > 0) {
      lines.push({
        description: `Damage / missing hire kit (${ctx.doc.documentNumber})`,
        quantity: 1,
        unitPrice: damageCharge,
        accountCode: '4450',
      });
    }
    if (lateFee > 0) {
      lines.push({
        description: `Late return fee (${ctx.doc.documentNumber})`,
        quantity: 1,
        unitPrice: lateFee,
        accountCode: '4450',
      });
    }
    if (extraHire > 0) {
      lines.push({
        description: `Hire extension (${ctx.doc.documentNumber})`,
        quantity: 1,
        unitPrice: extraHire,
        accountCode: '4400',
      });
    }

    const created = await createCommercialDocument({
      documentType: 'sales_invoice',
      partyName: ctx.doc.partyName ?? 'Customer',
      issueDate: today,
      notes: `Hire charges for ${ctx.doc.documentNumber}`,
      saleChannel: 'local',
      invoiceKind: 'commercial',
      lines,
    });
    if (!created.ok || !created.id) {
      return { ok: false, error: created.error || 'Could not create hire charges invoice.' };
    }
    const invoiceId = created.id;

    if (input.applyDeposit && ctx.event) {
      const apply = Math.min(depositOpen(ctx.event), money(damageCharge + lateFee + extraHire));
      if (apply > 0) {
        await withTenantContext(user.tenantId, async () => {
          await assertOpenPeriod(user.tenantId, today);
          const [chargeDoc] = await db()
            .select({
              id: businessDocuments.id,
              documentNumber: businessDocuments.documentNumber,
              paidAmount: businessDocuments.paidAmount,
              total: businessDocuments.total,
            })
            .from(businessDocuments)
            .where(eq(businessDocuments.id, invoiceId))
            .limit(1);
          const liability = await accountByCode(user.tenantId, '2400');
          const ar = await accountByCode(user.tenantId, '1300');
          await postBalanced({
            tenantId: user.tenantId,
            userId: user.id,
            party: ctx.doc.partyName ?? 'Customer',
            description: `Apply hire deposit to ${chargeDoc?.documentNumber ?? 'charges'}`,
            amount: apply,
            date: today,
            paymentAccountId: liability.id,
            debitAccountId: liability.id,
            creditAccountId: ar.id,
            categoryCode: '2400',
            categoryName: liability.name,
            direction: 'money_out',
            invoiceRef: chargeDoc?.documentNumber,
          });
          if (chargeDoc) {
            const newPaid = Number(chargeDoc.paidAmount) + apply;
            const newBalance = Math.max(0, Number(chargeDoc.total) - newPaid);
            await db()
              .update(businessDocuments)
              .set({
                paidAmount: newPaid.toFixed(2),
                balanceDue: newBalance.toFixed(2),
                status: newBalance <= 0.005 ? 'paid' : 'partial',
                updatedAt: new Date(),
              })
              .where(eq(businessDocuments.id, chargeDoc.id));
          }
          await db()
            .update(rentalEvents)
            .set({
              depositApplied: (Number(ctx.event!.depositApplied) + apply).toFixed(2),
              updatedAt: new Date(),
            })
            .where(eq(rentalEvents.id, ctx.event!.id));
        });
      }
    }

    revalidateMoney(input.documentId);
    revalidatePath(`/sales/invoices/${invoiceId}`);
    return { ok: true, invoiceId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not invoice hire charges.' };
  }
}
