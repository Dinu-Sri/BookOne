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

describe('company settings GET after requireTenantContext (BUG-0054 / HTTP-104)', () => {
  it('getCompanySettingsData re-enters withTenantContext and does not insert memberships', () => {
    const source = readRepo('apps/web/src/app/actions/company-settings.ts');
    const body = functionBody(source, 'getCompanySettingsData');
    expect(body).toContain('await requireTenantContext()');
    expect(body).toContain('return withTenantContext(user.tenantId, async () => {');
    expect(body).not.toContain('ensureMembership');
    expect(body).not.toContain('insert(tenantMemberships)');
    expect(body.indexOf('withTenantContext(user.tenantId')).toBeLessThan(body.indexOf('.from(companyProfiles)'));
    expect(body.indexOf('withTenantContext(user.tenantId')).toBeLessThan(body.indexOf('.from(taxProfiles)'));
  });

  it('profile and tax writes still deny via assertPermission', () => {
    const source = readRepo('apps/web/src/app/actions/company-settings.ts');
    const profile = functionBody(source, 'saveCompanyProfile');
    const tax = functionBody(source, 'saveTaxProfile');
    expect(profile).toContain("await assertPermission('company.details.write', 'write')");
    expect(profile).toContain('withTenantContext(user.tenantId');
    expect(tax).toContain("await assertPermission('company.tax.write', 'write')");
    expect(tax).toContain('withTenantContext(user.tenantId');
  });
});

describe('platform catalog under restricted DB (BUG-0055 / HTTP-105)', () => {
  it('company listing uses the privileged catalog after requirePlatformAdmin', () => {
    const source = readRepo('apps/web/src/app/actions/platform.ts');
    const list = functionBody(source, 'listPlatformCompanies');
    expect(list).toContain('await requirePlatformAdmin()');
    expect(list).toContain('return loadCompanyRows(filter)');
    expect(source).toContain('FROM public.bookone_platform_list_tenants()');
    expect(source.indexOf('requirePlatformAdmin')).toBeLessThan(source.indexOf('bookone_platform_list_tenants'));
  });

  it('company detail and writes pin request-local tenant context', () => {
    const source = readRepo('apps/web/src/app/actions/platform.ts');
    const detail = functionBody(source, 'getPlatformCompany');
    expect(detail).toContain('await requirePlatformAdmin()');
    expect(detail).toContain('return withTenantContext(id, async () => {');
    expect(functionBody(source, 'updatePlatformCompanyFromForm')).toContain('withTenantContext(id');
    expect(functionBody(source, 'setPlatformCompanyStatusFromForm')).toContain('withTenantContext(id');
    expect(functionBody(source, 'createPlatformCompanyFromForm')).toContain('withTenantContext(tenantId');
    expect(functionBody(source, 'createPlatformCompanyFromForm')).toContain('lookupUserIdByEmail');
    expect(source).toContain('FROM public.bookone_lookup_user_by_email');
  });

  it('normal-role Control Room page still denies before listing', () => {
    const page = readRepo('apps/web/src/app/control-room/companies/page.tsx');
    expect(page).toContain('isPlatformAdmin(tenant)');
    expect(page).toContain("redirect('/')");
    expect(page).toContain('listPlatformCompanies(');
  });
});

describe('privileged lookup hardening (INV-20261016-042 / migration 043)', () => {
  it('keeps historical 042 unchanged and hardens via forward 043', () => {
    const historical = readRepo('packages/db/migrations/042_lookup_user_by_email.sql');
    expect(historical).toContain('SET search_path = public');
    expect(historical).not.toContain('pg_temp');

    const forward = readRepo('packages/db/migrations/043_secure_definer_lookups.sql');
    expect(forward).toContain('SET search_path = pg_catalog, public, pg_temp');
    expect(forward).toContain('FROM public.users u');
    expect(forward).toContain('FROM public.tenants t');
    expect(forward).toContain('ALTER FUNCTION public.%s OWNER TO %I');
    expect(forward).toContain('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC');
    expect(forward).toContain('bookone_platform_list_tenants()');
    expect(forward).toContain('Does not GRANT BYPASSRLS');
    expect(forward).not.toMatch(/^\s*GRANT\s+BYPASSRLS/im);
    expect(forward).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
    const pathIdx = forward.indexOf('SET search_path = pg_catalog, public, pg_temp');
    const tempIdx = forward.indexOf('pg_temp', pathIdx);
    const publicIdx = forward.indexOf('public', pathIdx);
    expect(tempIdx).toBeGreaterThan(publicIdx);
  });
});
