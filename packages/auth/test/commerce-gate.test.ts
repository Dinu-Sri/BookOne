import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_VERSION, PERMISSION_KEYS, screenKeyFromHref } from '../src/permissions/catalog';
import { templateByKey } from '../src/permissions/templates';

const root = path.resolve(__dirname, '../../..');

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('Commerce C1–C3 CoreGuard contracts', () => {
  it('keeps catalog v2 and registers commerce company grants', () => {
    expect(CATALOG_VERSION).toBe(2);
    expect(PERMISSION_KEYS).toContain('company.commerce.read');
    expect(PERMISSION_KEYS).toContain('company.commerce.write');
    expect(screenKeyFromHref('/company/commerce')).toBe('company.commerce');
    expect(templateByKey('owner')!.grants).toContain('company.commerce.write');
    expect(templateByKey('viewer')!.grants).toContain('company.commerce.read');
    expect(templateByKey('viewer')!.grants).not.toContain('company.commerce.write');
  });

  it('keeps commerce API public, credentials separate from AgentBridge, and RLS on 050', () => {
    const middleware = read('apps/web/src/middleware.ts');
    expect(middleware).toMatch(/\/api\/commerce/);
    const runtime = read('apps/web/src/lib/commerce-runtime.ts');
    expect(runtime).toMatch(/createCommercialDocumentWithUser/);
    expect(runtime).toMatch(/alreadyAuthorized: true/);
    expect(runtime).not.toMatch(/agentBridgeTokenSecret/);
    const sql = read('packages/db/migrations/050_commerce.sql');
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/bookone_commerce_lookup_credential/);
    expect(sql).toMatch(/commerce_orders_external_uq/);
    expect(sql).toMatch(/posting_mode varchar\(20\) NOT NULL DEFAULT 'preview'/);
  });

  it('ships an installable Woo plugin that declares HPOS and never prints the token to shoppers', () => {
    const plugin = read('connectors/woocommerce/bookone-commerce/bookone-commerce.php');
    expect(plugin).toMatch(/custom_order_tables/);
    expect(plugin).toMatch(/BOOKONE_COMMERCE_VERSION/);
    const client = read('connectors/woocommerce/bookone-commerce/includes/class-bookone-client.php');
    expect(client).toMatch(/update_option\('bookone_commerce_settings'/);
    expect(client).toMatch(/false\);/);
    const admin = read('connectors/woocommerce/bookone-commerce/includes/class-bookone-admin.php');
    expect(admin).not.toMatch(/echo \$s\['token'\]/);
    const http = read('scripts/commerce/http-client.ts');
    expect(http).not.toMatch(/connectors\/woocommerce/);
    expect(http).not.toMatch(/from ['\"]@woocommerce/);
    expect(existsSync(path.join(root, 'scripts/commerce/package-plugin.mjs'))).toBe(true);
  });

  it('wires commerce into CoreGuard so a missing required result cannot ship', () => {
    const run = read('scripts/coreguard/run.ts');
    expect(run).toMatch(/@bookone\/commerce/);
    expect(run).toMatch(/commerce-results\.json/);
    expect(run).toMatch(/package-plugin\.mjs/);
    expect(run).toMatch(/coreguard-commerce/);
    const playwright = read('apps/web/playwright.coreguard.config.ts');
    expect(playwright).toMatch(/commerce/);
    const docker = read('.github/workflows/docker-web.yml');
    expect(docker).toMatch(/needs: \[quality, coreguard\]/);
    expect(docker).toMatch(/@bookone\/commerce/);
    expect(existsSync(path.join(root, 'docs/commerce/QUICKSTART.md'))).toBe(true);
    expect(existsSync(path.join(root, 'docs/commerce/OPS.md'))).toBe(true);
    expect(existsSync(path.join(root, 'docs/commerce/MATRIX.md'))).toBe(true);
    expect(existsSync(path.join(root, 'docs/commerce/openapi.yaml'))).toBe(true);
  });
});
