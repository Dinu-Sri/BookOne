'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { db, eq, purchaseSettings, withTenantContext } from '@bookone/db';

const schema = z.object({
  requireBillApproval: z.boolean(),
  requireSupplierInvoiceNo: z.boolean(),
  blockDuplicateBills: z.boolean(),
  requireGrnBeforeBill: z.boolean(),
  postGrniOnReceipt: z.boolean(),
  defaultPaymentTerms: z.string().max(40),
  defaultExpenseAccount: z.string().max(20),
});

export interface PurchaseSettingsRow {
  requireBillApproval: boolean;
  requireSupplierInvoiceNo: boolean;
  blockDuplicateBills: boolean;
  requireGrnBeforeBill: boolean;
  postGrniOnReceipt: boolean;
  defaultPaymentTerms: string;
  defaultExpenseAccount: string;
}

const DEFAULTS: PurchaseSettingsRow = {
  requireBillApproval: false,
  requireSupplierInvoiceNo: false,
  blockDuplicateBills: true,
  requireGrnBeforeBill: false,
  postGrniOnReceipt: false,
  defaultPaymentTerms: 'Net 30',
  defaultExpenseAccount: '6800',
};

function mapRow(row: {
  requireBillApproval: string;
  requireSupplierInvoiceNo: string;
  blockDuplicateBills: string;
  requireGrnBeforeBill: string;
  postGrniOnReceipt?: string | null;
  defaultPaymentTerms: string;
  defaultExpenseAccount: string;
}): PurchaseSettingsRow {
  return {
    requireBillApproval: row.requireBillApproval === '1',
    requireSupplierInvoiceNo: row.requireSupplierInvoiceNo === '1',
    blockDuplicateBills: row.blockDuplicateBills === '1',
    requireGrnBeforeBill: row.requireGrnBeforeBill === '1',
    postGrniOnReceipt: row.postGrniOnReceipt === '1',
    defaultPaymentTerms: row.defaultPaymentTerms || 'Net 30',
    defaultExpenseAccount: row.defaultExpenseAccount || '6800',
  };
}

export async function getPurchaseSettings(): Promise<PurchaseSettingsRow> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [row] = await db()
      .select()
      .from(purchaseSettings)
      .where(eq(purchaseSettings.tenantId, user.tenantId))
      .limit(1);
    if (!row) return { ...DEFAULTS };
    return mapRow(row);
  });
}

export async function savePurchaseSettingsFromForm(formData: FormData): Promise<void> {
  const parsed = schema.parse({
    requireBillApproval:
      formData.get('requireBillApproval') === 'on' || formData.get('requireBillApproval') === '1',
    requireSupplierInvoiceNo:
      formData.get('requireSupplierInvoiceNo') === 'on' ||
      formData.get('requireSupplierInvoiceNo') === '1',
    blockDuplicateBills:
      formData.get('blockDuplicateBills') === 'on' || formData.get('blockDuplicateBills') === '1',
    requireGrnBeforeBill:
      formData.get('requireGrnBeforeBill') === 'on' || formData.get('requireGrnBeforeBill') === '1',
    postGrniOnReceipt:
      formData.get('postGrniOnReceipt') === 'on' || formData.get('postGrniOnReceipt') === '1',
    defaultPaymentTerms: String(formData.get('defaultPaymentTerms') ?? 'Net 30').trim() || 'Net 30',
    defaultExpenseAccount: String(formData.get('defaultExpenseAccount') ?? '6800').trim() || '6800',
  });

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select({ id: purchaseSettings.id })
      .from(purchaseSettings)
      .where(eq(purchaseSettings.tenantId, user.tenantId))
      .limit(1);

    const values = {
      requireBillApproval: parsed.requireBillApproval ? '1' : '0',
      requireSupplierInvoiceNo: parsed.requireSupplierInvoiceNo ? '1' : '0',
      blockDuplicateBills: parsed.blockDuplicateBills ? '1' : '0',
      requireGrnBeforeBill: parsed.requireGrnBeforeBill ? '1' : '0',
      postGrniOnReceipt: parsed.postGrniOnReceipt ? '1' : '0',
      defaultPaymentTerms: parsed.defaultPaymentTerms,
      defaultExpenseAccount: parsed.defaultExpenseAccount,
      updatedAt: new Date(),
    };

    if (existing) {
      await db().update(purchaseSettings).set(values).where(eq(purchaseSettings.id, existing.id));
    } else {
      await db().insert(purchaseSettings).values({ tenantId: user.tenantId, ...values });
    }
  });

  revalidatePath('/company/purchase');
  revalidatePath('/purchase/purchases');
  revalidatePath('/purchase/import');
}
