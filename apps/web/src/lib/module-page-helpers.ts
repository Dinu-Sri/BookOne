import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { listProducts } from '@/app/actions/inventory';
import { listActiveDiscounts } from '@/app/actions/commercial-docs';
import { getDocumentFormOptions } from '@/app/actions/documents';

export async function requireTenant() {
  try {
    return await getTenantInfo();
  } catch {
    redirect('/login');
  }
}

export async function loadSalesFormData() {
  const [products, discounts, options] = await Promise.all([
    listProducts().catch(() => []),
    listActiveDiscounts().catch(() => []),
    getDocumentFormOptions().catch(() => ({
      revenueAccounts: [],
      expenseAccounts: [],
      paymentAccounts: [],
    })),
  ]);
  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      sellPrice: p.sellPrice,
      unitCost: p.unitCost,
    })),
    discounts,
    paymentAccounts: options.paymentAccounts,
    expenseAccounts: options.expenseAccounts,
  };
}
