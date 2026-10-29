/**
 * Tenant-scoped financial actor/action audit. Journals and source labels are
 * not this layer. These table names match audit_log.table_name writers.
 */
export const FINANCIAL_AUDIT_TABLES = [
  'business_documents',
  'settlement_allocations',
  'transactions',
  'inventory_products',
  'inventory_stock_docs',
  'inventory_product_categories',
  'sales_discounts',
  'parties',
  'bank_statement_imports',
  'period_locks',
] as const;

export type FinancialAuditTable = (typeof FINANCIAL_AUDIT_TABLES)[number];

const FINANCIAL_TABLE_SET = new Set<string>(FINANCIAL_AUDIT_TABLES);

export function isFinancialAuditTable(tableName: string): boolean {
  return FINANCIAL_TABLE_SET.has(tableName);
}

export function financialAuditSourceLabel(tableName: string): string {
  switch (tableName) {
    case 'business_documents':
      return 'Document';
    case 'settlement_allocations':
      return 'Payment allocation';
    case 'transactions':
      return 'Transaction';
    case 'inventory_products':
      return 'Product';
    case 'inventory_stock_docs':
      return 'Stock document';
    case 'inventory_product_categories':
      return 'Product category';
    case 'sales_discounts':
      return 'Discount';
    case 'parties':
      return 'Party';
    case 'bank_statement_imports':
      return 'Bank import';
    case 'period_locks':
      return 'Period lock';
    default:
      return tableName;
  }
}

/** Compact event text from stored audit newValues. Does not dump full JSON. */
export function financialAuditEventSummary(newValues: unknown, notes: string | null): string {
  const parts: string[] = [];
  if (notes?.trim()) parts.push(notes.trim());
  if (newValues && typeof newValues === 'object' && !Array.isArray(newValues)) {
    const row = newValues as Record<string, unknown>;
    const number = row.documentNumber ?? row.document_number;
    const type = row.documentType ?? row.document_type;
    const total = row.total ?? row.amount;
    if (typeof number === 'string' && number.trim()) parts.push(number.trim());
    if (typeof type === 'string' && type.trim()) parts.push(type.trim());
    if (typeof total === 'number' && Number.isFinite(total)) {
      parts.push(total.toFixed(2));
    } else if (typeof total === 'string' && total.trim()) {
      parts.push(total.trim());
    }
  }
  return parts.join(' · ') || 'Financial event';
}
