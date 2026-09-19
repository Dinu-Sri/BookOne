'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { db, eq, salesSettings, withTenantContext } from '@bookone/db';

const schema = z.object({
  vatRatePercent: z.number().min(0).max(100),
  exportVatRatePercent: z.number().min(0).max(100),
  vatRegistered: z.boolean(),
  taxInvoiceDeptCode: z.string().min(1).max(40),
  defaultSaleChannel: z.enum(['local', 'export']),
  defaultInvoiceKind: z.enum(['commercial', 'tax_invoice']),
  enforceCreditLimit: z.boolean(),
  editLockDays: z.number().int().min(0).max(3650),
  invoicePrefix: z.string().max(20).optional(),
  invoicePostfix: z.string().max(20).optional(),
  invoicePad: z.number().int().min(2).max(8).optional(),
  invoiceReset: z.enum(['monthly', 'yearly', 'never']).optional(),
  quotePrefix: z.string().max(20).optional(),
  quotePostfix: z.string().max(20).optional(),
  quotePad: z.number().int().min(2).max(8).optional(),
  quoteReset: z.enum(['monthly', 'yearly', 'never']).optional(),
});

export interface SalesSettingsRow {
  vatRatePercent: number;
  exportVatRatePercent: number;
  vatRegistered: boolean;
  taxInvoiceDeptCode: string;
  defaultSaleChannel: string;
  defaultInvoiceKind: string;
  enforceCreditLimit: boolean;
  editLockDays: number;
  invoicePrefix: string;
  invoicePostfix: string;
  invoicePad: number;
  invoiceReset: string;
  quotePrefix: string;
  quotePostfix: string;
  quotePad: number;
  quoteReset: string;
}

const DEFAULTS: SalesSettingsRow = {
  vatRatePercent: 18,
  exportVatRatePercent: 0,
  vatRegistered: false,
  taxInvoiceDeptCode: '01',
  defaultSaleChannel: 'local',
  defaultInvoiceKind: 'commercial',
  enforceCreditLimit: false,
  editLockDays: 0,
  invoicePrefix: 'INV',
  invoicePostfix: '',
  invoicePad: 4,
  invoiceReset: 'monthly',
  quotePrefix: 'QT',
  quotePostfix: '',
  quotePad: 4,
  quoteReset: 'monthly',
};

export async function getSalesSettings(): Promise<SalesSettingsRow> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [row] = await db()
      .select()
      .from(salesSettings)
      .where(eq(salesSettings.tenantId, user.tenantId))
      .limit(1);
    if (!row) return { ...DEFAULTS };
    return {
      vatRatePercent: Number(row.vatRatePercent),
      exportVatRatePercent: Number(row.exportVatRatePercent),
      vatRegistered: row.vatRegistered === '1',
      taxInvoiceDeptCode: row.taxInvoiceDeptCode,
      defaultSaleChannel: row.defaultSaleChannel,
      defaultInvoiceKind: row.defaultInvoiceKind,
      enforceCreditLimit: row.enforceCreditLimit === '1',
      editLockDays: Number(row.editLockDays ?? 0) || 0,
      invoicePrefix: row.invoicePrefix || 'INV',
      invoicePostfix: row.invoicePostfix || '',
      invoicePad: Number(row.invoicePad ?? 4) || 4,
      invoiceReset: row.invoiceReset || 'monthly',
      quotePrefix: row.quotePrefix || 'QT',
      quotePostfix: row.quotePostfix || '',
      quotePad: Number(row.quotePad ?? 4) || 4,
      quoteReset: row.quoteReset || 'monthly',
    };
  });
}

export async function saveSalesSettingsFromForm(formData: FormData): Promise<void> {
  const parsed = schema.parse({
    vatRatePercent: Number(String(formData.get('vatRatePercent') ?? '18').replace(/[^0-9.]/g, '')) || 18,
    exportVatRatePercent: Number(String(formData.get('exportVatRatePercent') ?? '0').replace(/[^0-9.]/g, '')) || 0,
    vatRegistered: formData.get('vatRegistered') === 'on' || formData.get('vatRegistered') === '1',
    taxInvoiceDeptCode: String(formData.get('taxInvoiceDeptCode') ?? '01').trim() || '01',
    defaultSaleChannel: String(formData.get('defaultSaleChannel') ?? 'local'),
    defaultInvoiceKind: String(formData.get('defaultInvoiceKind') ?? 'commercial'),
    enforceCreditLimit:
      formData.get('enforceCreditLimit') === 'on' || formData.get('enforceCreditLimit') === '1',
    editLockDays: Math.max(0, parseInt(String(formData.get('editLockDays') ?? '0'), 10) || 0),
    invoicePrefix: String(formData.get('invoicePrefix') ?? 'INV'),
    invoicePostfix: String(formData.get('invoicePostfix') ?? ''),
    invoicePad: Math.min(8, Math.max(2, parseInt(String(formData.get('invoicePad') ?? '4'), 10) || 4)),
    invoiceReset: String(formData.get('invoiceReset') ?? 'monthly'),
    quotePrefix: String(formData.get('quotePrefix') ?? 'QT'),
    quotePostfix: String(formData.get('quotePostfix') ?? ''),
    quotePad: Math.min(8, Math.max(2, parseInt(String(formData.get('quotePad') ?? '4'), 10) || 4)),
    quoteReset: String(formData.get('quoteReset') ?? 'monthly'),
  });

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select({ id: salesSettings.id })
      .from(salesSettings)
      .where(eq(salesSettings.tenantId, user.tenantId))
      .limit(1);

    const values = {
      tenantId: user.tenantId,
      vatRatePercent: parsed.vatRatePercent.toFixed(2),
      exportVatRatePercent: parsed.exportVatRatePercent.toFixed(2),
      vatRegistered: parsed.vatRegistered ? '1' : '0',
      taxInvoiceDeptCode: parsed.taxInvoiceDeptCode,
      defaultSaleChannel: parsed.defaultSaleChannel,
      defaultInvoiceKind: parsed.defaultInvoiceKind,
      enforceCreditLimit: parsed.enforceCreditLimit ? '1' : '0',
      editLockDays: parsed.editLockDays,
      invoicePrefix: (parsed.invoicePrefix ?? 'INV').trim() || 'INV',
      invoicePostfix: (parsed.invoicePostfix ?? '').trim(),
      invoicePad: parsed.invoicePad ?? 4,
      invoiceReset: parsed.invoiceReset ?? 'monthly',
      quotePrefix: (parsed.quotePrefix ?? 'QT').trim() || 'QT',
      quotePostfix: (parsed.quotePostfix ?? '').trim(),
      quotePad: parsed.quotePad ?? 4,
      quoteReset: parsed.quoteReset ?? 'monthly',
      updatedAt: new Date(),
    };

    if (existing) {
      await db().update(salesSettings).set(values).where(eq(salesSettings.id, existing.id));
    } else {
      await db().insert(salesSettings).values(values);
    }
  });

  revalidatePath('/company/sales');
  revalidatePath('/sales/invoices');
  const { redirect } = await import('next/navigation');
  redirect('/company/sales?flash=saved');
}
