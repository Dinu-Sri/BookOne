import { db, eq, inventorySettings, purchaseSettings, withTenantContext } from '@bookone/db';

/**
 * Tenant-scoped settings loaders for posting paths that run without a browser
 * session (commerce API, AgentBridge). The session-based getters fell back to
 * defaults there, so "Block negative stock" was ignored (QA-1126-16).
 */
export interface TenantInventorySettings {
  negativeStockPolicy: 'allow' | 'block';
  costingMethod: 'last' | 'average' | 'fifo';
}

/** QA-1126-21: a company that never chose a policy blocks negative stock. */
export const INVENTORY_SETTINGS_DEFAULTS: TenantInventorySettings = {
  negativeStockPolicy: 'block',
  costingMethod: 'last',
};

export async function loadInventorySettings(tenantId: string): Promise<TenantInventorySettings> {
  return withTenantContext(tenantId, async () => {
    const [row] = await db()
      .select()
      .from(inventorySettings)
      .where(eq(inventorySettings.tenantId, tenantId))
      .limit(1);
    if (!row) return { ...INVENTORY_SETTINGS_DEFAULTS };
    return {
      negativeStockPolicy: row.negativeStockPolicy === 'allow' ? 'allow' : 'block',
      costingMethod:
        row.costingMethod === 'average' ? 'average' : row.costingMethod === 'fifo' ? 'fifo' : 'last',
    };
  });
}

export interface TenantPurchaseSettings {
  requireBillApproval: boolean;
  requireSupplierInvoiceNo: boolean;
  blockDuplicateBills: boolean;
  requireGrnBeforeBill: boolean;
  postGrniOnReceipt: boolean;
  defaultPaymentTerms: string;
  defaultExpenseAccount: string;
}

export const PURCHASE_SETTINGS_DEFAULTS: TenantPurchaseSettings = {
  requireBillApproval: false,
  requireSupplierInvoiceNo: false,
  blockDuplicateBills: true,
  requireGrnBeforeBill: false,
  postGrniOnReceipt: false,
  defaultPaymentTerms: 'Net 30',
  defaultExpenseAccount: '6800',
};

export async function loadPurchaseSettings(tenantId: string): Promise<TenantPurchaseSettings> {
  return withTenantContext(tenantId, async () => {
    const [row] = await db()
      .select()
      .from(purchaseSettings)
      .where(eq(purchaseSettings.tenantId, tenantId))
      .limit(1);
    if (!row) return { ...PURCHASE_SETTINGS_DEFAULTS };
    return {
      requireBillApproval: row.requireBillApproval === '1',
      requireSupplierInvoiceNo: row.requireSupplierInvoiceNo === '1',
      blockDuplicateBills: row.blockDuplicateBills === '1',
      requireGrnBeforeBill: row.requireGrnBeforeBill === '1',
      postGrniOnReceipt: row.postGrniOnReceipt === '1',
      defaultPaymentTerms: row.defaultPaymentTerms || 'Net 30',
      defaultExpenseAccount: row.defaultExpenseAccount || '6800',
    };
  });
}
