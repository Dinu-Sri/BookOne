import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('Commerce WP0 — held stock outside commerce', () => {
  it('POS and manual sales cannot sell stock held for web orders when negative stock is blocked', () => {
    const docs = read('apps/web/src/app/actions/commercial-docs.ts');
    const start = docs.indexOf('async function adjustStock(');
    const body = docs.slice(start, docs.indexOf('\nexport ', start));
    expect(body).toMatch(/committedWebOrderQty\(params\.tenantId, params\.productId/);
    expect(body).toMatch(/next - held < -0\.00005/);
  });

  it('migration 055 adds the commitments table with tenant isolation and the fulfilment column', () => {
    const sql = read('packages/db/migrations/055_commerce_commitments_fulfilment.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS commerce_stock_commitments/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/commerce_stock_commitments_isolation/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS fulfilment jsonb/);
  });
});

describe('Commerce API screen', () => {
  it('has task-based tabs including Orders, Payments, Settings and Developer', () => {
    const ui = read('apps/web/src/components/commerce/company-commerce.tsx');
    for (const label of ['Overview', 'Orders', 'Products', 'Payments', 'Settings', 'Developer', 'Activity']) {
      expect(ui).toContain(`label: '${label}'`);
    }
    expect(ui).toMatch(/<CommerceWebOrders/);
    expect(ui).toMatch(/<CommerceFulfilmentCard/);
  });

  it('new commerce components use registry controls only', () => {
    for (const file of ['commerce-web-orders.tsx', 'commerce-fulfilment-card.tsx', 'commerce-payments-card.tsx']) {
      const src = read(`apps/web/src/components/commerce/${file}`);
      expect(src, file).not.toMatch(/<select\b/);
      expect(src, file).not.toMatch(/type="date"/);
    }
  });

  it('old ?tab=connections links still open the screen (Overview)', () => {
    const page = read('apps/web/src/app/company/commerce/page.tsx');
    expect(page).toMatch(/\?\? 'overview'/);
  });
});
