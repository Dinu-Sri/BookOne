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
});

export interface SalesSettingsRow {
  vatRatePercent: number;
  exportVatRatePercent: number;
  vatRegistered: boolean;
  taxInvoiceDeptCode: string;
  defaultSaleChannel: string;
  defaultInvoiceKind: string;
}

const DEFAULTS: SalesSettingsRow = {
  vatRatePercent: 18,
  exportVatRatePercent: 0,
  vatRegistered: false,
  taxInvoiceDeptCode: '01',
  defaultSaleChannel: 'local',
  defaultInvoiceKind: 'commercial',
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
