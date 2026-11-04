import { describe, expect, it } from 'vitest';
import {
  FINANCIAL_AUDIT_TABLES,
  financialAuditEventSummary,
  financialAuditSourceLabel,
  isFinancialAuditTable,
} from '../src/financial-audit';

describe('financial audit surface', () => {
  it('includes document, allocation and transaction writers and excludes team access tables', () => {
    expect(FINANCIAL_AUDIT_TABLES).toContain('business_documents');
    expect(FINANCIAL_AUDIT_TABLES).toContain('settlement_allocations');
    expect(FINANCIAL_AUDIT_TABLES).toContain('transactions');
    expect(FINANCIAL_AUDIT_TABLES).toContain('rental_booking_lines');
    expect(FINANCIAL_AUDIT_TABLES).toContain('rental_events');
    expect(FINANCIAL_AUDIT_TABLES).toContain('inventory_stock_levels');
    expect(isFinancialAuditTable('business_documents')).toBe(true);
    expect(isFinancialAuditTable('rental_booking_lines')).toBe(true);
    expect(isFinancialAuditTable('tenant_roles')).toBe(false);
    expect(isFinancialAuditTable('tenant_memberships')).toBe(false);
    expect(isFinancialAuditTable('tenant.archive')).toBe(false);
  });

  it('binds actor-facing source labels and compact event text without dumping JSON', () => {
    expect(financialAuditSourceLabel('business_documents')).toBe('Document');
    expect(financialAuditSourceLabel('settlement_allocations')).toBe('Payment allocation');
    expect(financialAuditSourceLabel('rental_booking_lines')).toBe('Rental booking');
    expect(financialAuditSourceLabel('rental_events')).toBe('Rental event');
    expect(financialAuditSourceLabel('inventory_stock_levels')).toBe('Stock level');
    expect(
      financialAuditEventSummary(
        { documentNumber: 'PR0008', documentType: 'purchase_return', total: 60 },
        'Created commercial document and posted journal.',
      ),
    ).toBe('Created commercial document and posted journal. · PR0008 · purchase_return · 60.00');
  });
});
