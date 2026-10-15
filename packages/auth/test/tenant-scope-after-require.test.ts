import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepo(...parts: string[]) {
  return readFileSync(path.resolve(__dirname, '../../..', ...parts), 'utf8');
}

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('tenant GUC after requireTenantContext (BUG-0053 / HTTP-102)', () => {
  it('ALS tenant scope does not persist after the callback returns', async () => {
    const als = new AsyncLocalStorage<{ tenantId: string }>();
    await als.run({ tenantId: '11111111-1111-1111-1111-111111111111' }, async () => {
      expect(als.getStore()?.tenantId).toBe('11111111-1111-1111-1111-111111111111');
    });
    expect(als.getStore()).toBeUndefined();
  });

  it('withTenantContext pins then clears GUC on the reserved connection', () => {
    const helpers = readRepo('packages/db/src/helpers.ts');
    expect(helpers).toContain("set_config('app.current_tenant_id', ${id}, false)");
    expect(helpers).toContain("set_config('app.current_tenant_id', '', false)");
    expect(helpers).toContain('sql.release()');
    expect(helpers).toContain('currentTenantScopeId() === id');
  });

  it('getTenantInfo re-enters withTenantContext for the tenants row', () => {
    const body = functionBody(readRepo('apps/web/src/app/actions/workspace.ts'), 'getTenantInfo');
    expect(body).toContain('await requireTenantContext()');
    expect(body).toContain('return withTenantContext(user.tenantId, async () => {');
    expect(body.indexOf('withTenantContext(user.tenantId')).toBeLessThan(body.indexOf('.from(tenants)'));
    expect(body).toContain("throw new Error('Tenant not found.')");
  });

  it('cashbook tenant reads re-enter withTenantContext', () => {
    const cashbook = readRepo('apps/web/src/app/actions/cashbook.ts');
    const exportCsv = readRepo('apps/web/src/app/actions/cashbook-export.ts');
    for (const body of [
      functionBody(cashbook, 'listCashbookRows'),
      functionBody(cashbook, 'listYearDomainTotals'),
      functionBody(exportCsv, 'exportCashbookCsv'),
    ]) {
      expect(body).toContain('withTenantContext(user.tenantId');
      expect(body.indexOf('withTenantContext(user.tenantId')).toBeLessThan(body.indexOf('.from(tenants)'));
    }
  });

  it('invoice detail still loads tenant + document together', () => {
    const page = readRepo('apps/web/src/app/sales/invoices/[id]/page.tsx');
    expect(page).toContain('getTenantInfo()');
    expect(page).toContain('getCommercialDocument(id)');
    expect(page).toContain("redirect('/login')");
  });
});
