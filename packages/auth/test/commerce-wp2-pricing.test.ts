import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { zonedDayBoundary } from '../../../apps/web/src/lib/zoned-day';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('WP2 pricing (web side)', () => {
  it('sale dates are whole days in the company timezone', () => {
    expect(zonedDayBoundary('2026-12-01', 'Asia/Colombo', false)).toBe('2026-12-01T00:00:00+05:30');
    expect(zonedDayBoundary('2026-12-07', 'Asia/Colombo', true)).toBe('2026-12-07T23:59:59+05:30');
  });

  it('migration 057 adds price lists with tenant RLS and is re-runnable', () => {
    const sql = read('packages/db/migrations/057_price_lists.sql');
    expect(sql).toMatch(/create table if not exists price_lists/i);
    expect(sql).toMatch(/create table if not exists price_list_items/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/create unique index if not exists/i);
    expect(sql).not.toMatch(/drop table|drop column/i);
  });

  it('API route serves /pricing and passes customerGroup to catalog reads', () => {
    const route = read('apps/web/src/app/api/commerce/v1/[...path]/route.ts');
    expect(route).toContain("route === 'pricing'");
    expect(route).toContain('customerGroup');
  });

  it('Prices tab is wired and uses registry controls only', () => {
    const tab = read('apps/web/src/components/commerce/commerce-prices.tsx');
    expect(tab).not.toMatch(/<select\b/);
    expect(tab).not.toMatch(/type="date"/);
    expect(tab).toContain('DateField');
    expect(tab).toContain('withFormPending');
    const shell = read('apps/web/src/components/commerce/company-commerce.tsx');
    expect(shell).toContain("{ id: 'prices', label: 'Prices' }");
    const actions = read('apps/web/src/app/actions/commerce.ts');
    for (const name of ['savePriceListFromForm', 'setChannelPriceListFromForm', 'savePriceEntryFromForm', 'bulkPriceListFromForm']) {
      expect(actions).toContain(`export async function ${name}`);
    }
  });

  it('editing a product sell price notifies channels with a price change', () => {
    expect(read('apps/web/src/app/actions/inventory.ts')).toContain("'price')");
  });
});
