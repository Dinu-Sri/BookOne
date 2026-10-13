/** Tenant portable archive format (export). Restore transformers land in later phases. */

export const ARCHIVE_FORMAT = 'bookone.tenant-archive';
export const ARCHIVE_SCHEMA_VERSION = 1;
export const ARCHIVE_MAGIC = Buffer.from('B1AR1');

export const ARCHIVE_PREFIX = '_archive';

export type ArchiveKind = 'data' | 'files';

export type ArchiveManifest = {
  format: typeof ARCHIVE_FORMAT;
  exportId: string;
  schemaVersion: number;
  appVersion: string;
  appCommit: string;
  exportedAt: string;
  sourceTenantId: string;
  sourceName: string;
  sourceSlug: string;
  kind: ArchiveKind;
  dataSha256: string;
  filesSha256: string;
  fileCount: number;
  rowCounts: Record<string, number>;
  integrity: { trialBalanceHash: string };
};

export const ARCHIVE_EXCLUDED_TABLES = [
  'users',
  'platform_audit_events',
  'ops_request_logs',
  'ops_idempotency',
  'health_check_runs',
  'tenant_invites',
] as const;

export const ARCHIVE_DATA_TABLE_NAMES = [
  'tenants',
  'accounts',
  'parties',
  'transactions',
  'journal_entries',
  'journal_lines',
  'settlement_allocations',
  'audit_log',
  'period_locks',
  'bank_statement_profiles',
  'bank_statement_profile_versions',
  'bank_statement_imports',
  'bank_statement_lines',
  'bank_statement_import_events',
  'bank_import_issues',
  'bank_reconciliation_sessions',
  'bank_reconciliation_session_imports',
  'bank_reconciliation_cases',
  'bank_reconciliation_case_bank_lines',
  'bank_reconciliation_case_book_transactions',
  'bank_reconciliation_outstanding_items',
  'bank_reconciliation_events',
  'bank_reconciliation_snapshots',
  'business_documents',
  'business_document_lines',
  'document_styles',
  'tenant_memberships',
  'company_profiles',
  'tax_profiles',
  'financial_years',
  'brands',
  'locations',
  'company_domains',
  'inventory_products',
  'inventory_product_categories',
  'inventory_stock_levels',
  'inventory_stock_docs',
  'inventory_stock_doc_lines',
  'inventory_movements',
  'inventory_cost_layers',
  'inventory_cost_layer_consumptions',
  'sales_discounts',
  'sales_settings',
  'tax_invoice_sequences',
  'sales_invoice_sources',
  'purchase_settings',
  'inventory_settings',
  'rental_settings',
  'rental_events',
  'rental_booking_lines',
  'rental_return_photos',
  'rental_kit_components',
  'rental_serials',
  'pos_registers',
  'pos_shifts',
  'tenant_roles',
  'tenant_role_permissions',
  'tenant_membership_roles',
  'tenant_permission_overrides',
  'tenant_teams',
  'tenant_team_members',
  'tenant_membership_scopes',
] as const;

export const TRADING_COUNT_KEYS = [
  'parties',
  'transactions',
  'journal_entries',
  'journal_lines',
  'business_documents',
  'business_document_lines',
  'inventory_products',
  'inventory_stock_docs',
  'inventory_movements',
  'settlement_allocations',
  'pos_shifts',
  'bank_statement_imports',
  'bank_reconciliation_sessions',
  'rental_events',
] as const;

export type TradingCountKey = (typeof TRADING_COUNT_KEYS)[number];

/** Insert order for data restore (FK-safe). `tenants` is updated in place, never inserted. */
export const ARCHIVE_RESTORE_INSERT_ORDER = [
  'accounts',
  'brands',
  'locations',
  'company_profiles',
  'tax_profiles',
  'financial_years',
  'company_domains',
  'tenant_roles',
  'tenant_role_permissions',
  'tenant_memberships',
  'tenant_membership_roles',
  'tenant_permission_overrides',
  'tenant_teams',
  'tenant_team_members',
  'tenant_membership_scopes',
  'document_styles',
  'sales_settings',
  'tax_invoice_sequences',
  'purchase_settings',
  'inventory_settings',
  'rental_settings',
  'inventory_product_categories',
  'parties',
  'inventory_products',
  'inventory_stock_levels',
  'sales_discounts',
  'pos_registers',
  'pos_shifts',
  'period_locks',
  'transactions',
  'journal_entries',
  'journal_lines',
  'business_documents',
  'business_document_lines',
  'sales_invoice_sources',
  'settlement_allocations',
  'inventory_stock_docs',
  'inventory_stock_doc_lines',
  'inventory_movements',
  'inventory_cost_layers',
  'inventory_cost_layer_consumptions',
  'bank_statement_profiles',
  'bank_statement_profile_versions',
  'bank_statement_imports',
  'bank_statement_lines',
  'bank_statement_import_events',
  'bank_import_issues',
  'bank_reconciliation_sessions',
  'bank_reconciliation_session_imports',
  'bank_reconciliation_cases',
  'bank_reconciliation_case_bank_lines',
  'bank_reconciliation_case_book_transactions',
  'bank_reconciliation_outstanding_items',
  'bank_reconciliation_events',
  'bank_reconciliation_snapshots',
  'rental_events',
  'rental_booking_lines',
  'rental_return_photos',
  'rental_kit_components',
  'rental_serials',
  'audit_log',
] as const;

export function isOperationallyEmpty(counts: Record<string, number>): boolean {
  return TRADING_COUNT_KEYS.every((key) => (counts[key] ?? 0) === 0);
}

export function archiveObjectPrefix(tenantId: string): string {
  return `tenants/${tenantId}/${ARCHIVE_PREFIX}/`;
}

export function isArchiveObjectKey(tenantId: string, key: string): boolean {
  return key.startsWith(archiveObjectPrefix(tenantId));
}

export function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return { $binary: value.toString('base64') };
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, jsonReplacer);
}
