import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { listProducts } from '@/app/actions/inventory';
import { listActiveDiscounts } from '@/app/actions/commercial-docs';
import { getDocumentFormOptions } from '@/app/actions/documents';
import { listPartyOptions } from '@/app/actions/parties';
import { getSalesSettings } from '@/app/actions/sales-settings';
import { getPurchaseSettings } from '@/app/actions/purchase-settings';
import { getCompanySettingsData } from '@/app/actions/company-settings';

export async function requireTenant() {
  try {
    return await getTenantInfo();
  } catch {
    redirect('/login');
  }
}

export async function loadSalesFormData(partyRole: 'customer' | 'vendor' = 'customer') {
  const [products, discounts, options, partyOptions, salesSettings, purchaseSettings, company] =
    await Promise.all([
      listProducts().catch(() => []),
      listActiveDiscounts().catch(() => []),
      getDocumentFormOptions().catch(() => ({
        revenueAccounts: [],
        expenseAccounts: [],
        paymentAccounts: [],
      })),
      listPartyOptions(partyRole).catch(() => []),
      getSalesSettings().catch(() => ({
        vatRegistered: false,
        vatRatePercent: 18,
        exportVatRatePercent: 0,
        taxInvoiceDeptCode: '01',
        defaultSaleChannel: 'local',
        defaultInvoiceKind: 'commercial',
      })),
      getPurchaseSettings().catch(() => ({
        requireBillApproval: false,
        requireSupplierInvoiceNo: false,
        blockDuplicateBills: true,
        requireGrnBeforeBill: false,
        postGrniOnReceipt: false,
        defaultPaymentTerms: 'Net 30',
        defaultExpenseAccount: '6800',
      })),
      getCompanySettingsData().catch(() => null),
    ]);
  return {
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      sellPrice: p.sellPrice,
      unitCost: p.unitCost,
      barcode: p.barcode,
      imageUrl: p.imageUrl ?? null,
    })),
    discounts,
    paymentAccounts: options.paymentAccounts,
    expenseAccounts: options.expenseAccounts,
    partyOptions,
    vatRegistered: salesSettings.vatRegistered,
    vatRatePercent: salesSettings.vatRatePercent,
    purchaseSettings,
    locations: (company?.locations ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      code: l.code,
    })),
  };
}
