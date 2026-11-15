import { readFileSync } from 'node:fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { templateByKey } from '../src/permissions/templates';
import { allows, type ResolveInput } from '../src/permissions/resolve';

function readRepo(...parts: string[]) {
  return readFileSync(path.resolve(__dirname, '../../..', ...parts), 'utf8');
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

const modules = {
  sales: true,
  purchase: true,
  inventory: true,
  pos: true,
  rental: true,
};

function input(over: Partial<ResolveInput> = {}): ResolveInput {
  const templateKey = over.primaryTemplateKey ?? 'viewer';
  const tmpl = templateByKey(templateKey);
  const grants =
    over.grants ??
    (tmpl?.grants ?? []).map((key) => ({
      key,
      level: (key.endsWith('.write') ? 'write' : 'read') as 'read' | 'write',
    }));
  return {
    platformRole: 'user',
    rbacEnforced: true,
    primaryTemplateKey: templateKey,
    extraTemplateKey: null,
    grants,
    overrides: [],
    entityKind: 'company',
    capabilityTier: 'full',
    modules,
    ...over,
  };
}

describe('POS register write authorization (Mission1 P1)', () => {
  it('save and archive assert company.sales_settings.write before mutating', () => {
    const source = readRepo('apps/web/src/app/actions/pos-registers.ts');
    const save = functionBody(source, 'savePosRegisterFromForm');
    const archive = functionBody(source, 'archivePosRegisterFromForm');
    expect(source).toContain("const POS_REGISTER_WRITE = 'company.sales_settings.write'");
    expect(save).toContain('await assertPermission(POS_REGISTER_WRITE, \'write\')');
    expect(save.indexOf('assertPermission')).toBeLessThan(save.indexOf('withTenantContext'));
    expect(archive).toContain('await assertPermission(POS_REGISTER_WRITE, \'write\')');
    expect(archive.indexOf('assertPermission')).toBeLessThan(archive.indexOf('withTenantContext'));
    expect(archive).toContain('Keep at least one active register.');
  });

  it('listPosRegisters does not insert a default register on the read path', () => {
    const list = functionBody(readRepo('apps/web/src/app/actions/pos-registers.ts'), 'listPosRegisters');
    expect(list).not.toContain('insert(posRegisters)');
    expect(list).toContain('requireTenantContext');
  });

  it('VAT settings write remains on the same company.sales_settings.write guard', () => {
    const save = functionBody(readRepo('apps/web/src/app/actions/sales-settings.ts'), 'saveSalesSettingsFromForm');
    expect(save).toContain("await assertPermission('company.sales_settings.write', 'write')");
  });

  it('Owner may write sales settings; Viewer and a custom read-only job may not', () => {
    const owner = input({ primaryTemplateKey: 'owner' });
    const viewer = input({ primaryTemplateKey: 'viewer' });
    const customReadOnly = input({
      primaryTemplateKey: 'sales',
      grants: [{ key: 'company.sales_settings.read', level: 'read' }],
    });
    expect(allows(owner, 'company.sales_settings.write', 'write')).toBe(true);
    expect(allows(viewer, 'company.sales_settings.write', 'write')).toBe(false);
    expect(allows(viewer, 'company.sales_settings.read', 'read')).toBe(true);
    expect(allows(customReadOnly, 'company.sales_settings.write', 'write')).toBe(false);
    expect(allows(customReadOnly, 'company.sales_settings.read', 'read')).toBe(true);
  });

  it('company sales page and Simple Entry derive write controls from the same policy', () => {
    const salesPage = readRepo('apps/web/src/app/company/sales/page.tsx');
    expect(salesPage).toContain("jobCanWrite(tenant, 'Sales Settings')");
    expect(salesPage).toContain('canWrite ? saveSalesSettingsFromForm');
    expect(salesPage).toContain('Add register');
    const simple = readRepo('apps/web/src/components/simple-entry/simple-entry-screen.tsx');
    expect(simple).toContain("jobCanWrite(tenant, 'Simple Entry')");
    expect(simple).toContain('this job cannot record entries');
    const invoice = readRepo('apps/web/src/app/sales/invoices/[id]/page.tsx');
    expect(invoice).toContain("jobCanWrite(tenant, 'Sales Invoices')");
    const detail = readRepo('apps/web/src/components/purchase/commercial-document-detail.tsx');
    expect(detail).toContain('canWrite &&');
    expect(detail).toContain('salesDocumentPresentation');
  });

  it('payment actions revalidate two-decimal amounts and the forms share one batch helper', () => {
    const docs = readRepo('apps/web/src/app/actions/documents.ts');
    expect(docs).toContain('isTwoDecimalCurrencyAmount');
    expect(docs).toContain('batchAllocationSchema');
    expect(docs).toContain('PAYMENT_INVALID_AMOUNT_MESSAGE');
    const receive = readRepo('apps/web/src/components/sales/receive-payments-form.tsx');
    const pay = readRepo('apps/web/src/components/purchase/pay-vendors-form.tsx');
    expect(receive).toContain('validatePaymentAllocationBatch');
    expect(receive).toContain('batch.validAllocations');
    expect(pay).toContain('validatePaymentAllocationBatch');
    expect(pay).toContain('batch.validAllocations');
    const reports = readRepo('apps/web/src/app/reports/page.tsx');
    expect(reports).toContain("id: 'vat'");
    expect(reports).toContain('Export CSV');
  });
});
