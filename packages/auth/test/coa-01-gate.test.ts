import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_VERSION, screenKeyFromHref } from '../src/permissions/catalog';

const root = path.resolve(__dirname, '../../..');

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('CoreGuard COA-01 source contracts', () => {
  it('keeps the permission catalog at v2 and maps CoA routes to accounting.accounts', () => {
    expect(CATALOG_VERSION).toBe(2);
    expect(screenKeyFromHref('/accounts')).toBe('accounting.accounts');
    expect(screenKeyFromHref('/accounts/new')).toBe('accounting.accounts');
    expect(screenKeyFromHref('/accounts/opening')).toBe('accounting.accounts');
    expect(screenKeyFromHref('/advances')).toBe('accounting.accounts');
  });

  it('cashbook bank writes assert a write permission', () => {
    const banks = read('apps/web/src/app/actions/cashbook-banks.ts');
    expect(banks).toMatch(/assertBankWrite/);
    expect(banks).toMatch(/accounting\.cashbook\.write/);
    expect(banks).toMatch(/accounting\.accounts\.write/);
    expect(banks).toMatch(/liquidity: 'bank'/);
  });

  it('business cashbook settings send users to the company chart, not home', () => {
    const page = read('apps/web/src/app/cashbook/settings/page.tsx');
    expect(page).toMatch(/\/accounts\?focus=bank/);
    expect(page).not.toMatch(/redirect\('\/'\)/);
  });

  it('dashboard and cash-flow classify custom 11xx banks', () => {
    const metrics = read('packages/accounting/src/dashboard-metrics.ts');
    const cash = read('packages/accounting/src/cash-flow.ts');
    expect(metrics).toMatch(/isSpendableCashCode/);
    expect(metrics).toMatch(/isCashUniverseCode/);
    expect(cash).toMatch(/isCashUniverseCode/);
    expect(metrics).not.toMatch(/SPENDABLE_CASH_CODES\.reduce/);
  });

  it('AgentBridge scopes are unchanged and CoA writes stay human UI', () => {
    const runtime = read('apps/web/src/lib/agent-bridge-runtime.ts');
    expect(runtime).not.toMatch(/createCompanyAccount/);
    expect(runtime).not.toMatch(/issuePartyAdvance/);
    const yaml = read('.github/workflows/docker-web.yml');
    expect(yaml).toMatch(/COA-01/);
    expect(yaml).toMatch(/coa-01-gate\.test\.ts/);
    expect(yaml).toMatch(/coa-01\.spec\.ts/);
    expect(yaml).toMatch(/needs: \[quality, coreguard\]/);
  });

  it('049 is additive and preserves account ids', () => {
    const sql = read('packages/db/migrations/049_chart_of_accounts.sql');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS subtype/);
    expect(sql).toMatch(/accounts_tenant_code_lower_uidx/);
    expect(sql).toMatch(/party_advances/);
    expect(sql).toMatch(/opening_balance_runs/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/DROP TABLE accounts/i);
    expect(sql).not.toMatch(/ALTER TABLE accounts DROP COLUMN/i);
  });
});
