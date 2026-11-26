import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('Commerce WP3-WP7 (web side)', () => {
  it('migration 058 is additive, re-runnable and RLS-isolated', () => {
    const sql = read('packages/db/migrations/058_commerce_wp3_wp7.sql');
    for (const t of ['commerce_reservations', 'commerce_webhooks', 'commerce_webhook_deliveries', 'commerce_customers', 'commerce_api_calls']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
      expect(sql).toContain(`'${t}'`);
    }
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS expires_at/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/RETURNS TABLE \(tenant_id uuid\)/);
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN/i);
  });

  it('POS and posting ignore expired reservation holds', () => {
    const docs = read('apps/web/src/app/actions/commercial-docs.ts');
    expect(docs).toMatch(/expiresAt\} is null or \$\{commerceStockCommitments\.expiresAt\} > now\(\)/);
    const store = read('packages/commerce/src/pg-store.ts');
    expect(store).toMatch(/expiresAt\} is null or \$\{commerceStockCommitments\.expiresAt\} > now\(\)/);
  });

  it('API route serves the new endpoints, health without a key, and logs calls', () => {
    const route = read('apps/web/src/app/api/commerce/v1/[...path]/route.ts');
    for (const fn of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) expect(route).toContain(`export async function ${fn}(`);
    for (const r of ["route === 'health'", "'reservations'", "'webhooks'", "'customers/'", "'/invoice'", "'/returns'", "'catalog/related'", "'catalog/new-arrivals'"]) {
      expect(route).toContain(r);
    }
    expect(route).toContain('idempotentReplay');
    expect(route).toContain('logApiCall');
    expect(route).toContain('startCommerceBackground');
  });

  it('background loop only visits companies with work and starts lazily', () => {
    const bg = read('apps/web/src/lib/commerce-background.ts');
    expect(bg).toContain('bookone_commerce_background_tenants');
    expect(bg).toContain("redirect: 'manual'");
    expect(bg).toContain('AbortSignal.timeout');
    expect(existsSync(path.join(ROOT, 'apps/web/src/instrumentation.ts'))).toBe(false);
  });

  it('new screens use registry controls and the busy overlay', () => {
    const dev = read('apps/web/src/components/commerce/commerce-developer-extras.tsx');
    expect(dev).not.toMatch(/<select\b/);
    expect(dev).not.toMatch(/type="date"/);
    expect(dev).toContain('withFormPending');
    expect(read('apps/web/src/components/commerce/company-commerce.tsx')).toContain('<CommerceWebhooksCard');
    expect(existsSync(path.join(ROOT, 'apps/web/src/app/company/commerce/packing-slip/page.tsx'))).toBe(true);
    const orders = read('apps/web/src/components/commerce/commerce-web-orders.tsx');
    expect(orders).toContain("actionForm('returned', 'Mark returned')");
    expect(orders).toContain('Packing slip');
  });

  it('invoices print web order details; categories, brands and photos reach the feed', () => {
    expect(read('apps/web/src/lib/commerce-runtime.ts')).toContain('notes: invoiceNotes(input.order)');
    expect(read('apps/web/src/app/actions/product-categories.ts')).toContain("notifyCommerceTaxonomy(user.tenantId, 'category'");
    expect(read('apps/web/src/app/actions/product-catalog.ts')).toContain("notifyCommerceTaxonomy(user.tenantId, 'brand'");
    expect(read('apps/web/src/app/actions/product-catalog.ts')).toContain("[productId], 'image')");
  });
});
