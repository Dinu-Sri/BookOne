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
    expect(PERMISSION_KEYS).toContain('agent_bridge.commerce_read');
    expect(PERMISSION_KEYS).toContain('agent_bridge.commerce_propose');
    expect(templateByKey('owner')!.grants).toContain('agent_bridge.commerce_read');
    expect(templateByKey('owner')!.grants).toContain('agent_bridge.commerce_propose');
    expect(templateByKey('accountant')!.grants).not.toContain('agent_bridge.commerce_read');
    expect(templateByKey('accountant')!.grants).not.toContain('agent_bridge.commerce_propose');
    expect(templateByKey('purchasing')!.grants).not.toContain('agent_bridge.commerce_read');
    expect(templateByKey('purchasing')!.grants).not.toContain('agent_bridge.commerce_propose');
    expect(templateByKey('viewer')!.grants).not.toContain('agent_bridge.commerce_read');
    expect(templateByKey('viewer')!.grants).not.toContain('agent_bridge.commerce_propose');
  });

  it('keeps commerce API public, credentials separate from AgentBridge, and RLS on 050', () => {
    const middleware = read('apps/web/src/middleware.ts');
    expect(middleware).toMatch(/\/api\/commerce/);
    const runtime = read('apps/web/src/lib/commerce-runtime.ts');
    expect(runtime).toMatch(/createCommercialDocumentWithUser/);
    expect(runtime).toMatch(/alreadyAuthorized: true/);
    const docs = read('apps/web/src/app/actions/commercial-docs.ts');
    expect(docs).toMatch(/dimensionScopeForUser/);
    expect(docs).toMatch(/alreadyAuthorized/);
    expect(docs).toMatch(/ensureParty\(/);
    const parties = read('apps/web/src/app/actions/parties.ts');
    expect(parties).toMatch(/actor \?\? \(await requireTenantContext\(\)\)/);
    expect(runtime).not.toMatch(/agentBridgeTokenSecret/);
    const sql = read('packages/db/migrations/050_commerce.sql');
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/bookone_commerce_lookup_credential/);
    expect(sql).toMatch(/commerce_orders_external_uq/);
    expect(sql).toMatch(/posting_mode varchar\(20\) NOT NULL DEFAULT 'preview'/);
    const catalogSql = read('packages/db/migrations/051_commerce_catalog.sql');
    expect(catalogSql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(catalogSql).toMatch(/commerce_mapping_proposals/);
    expect(catalogSql).toMatch(/commerce_publish_claims/);
  });

  it('ships an installable Woo plugin that declares HPOS and never prints the token to shoppers', () => {
    const plugin = read('connectors/woocommerce/bookone-commerce/bookone-commerce.php');
    expect(plugin).toMatch(/custom_order_tables/);
    expect(plugin).toMatch(/BOOKONE_COMMERCE_VERSION', '1\.2\.0'/);
    const sync = read('connectors/woocommerce/bookone-commerce/includes/class-bookone-sync.php');
    expect(sync).toMatch(/publish_from_bookone/);
    expect(sync).toMatch(/\/catalog\/candidates/);
    expect(sync).toMatch(/\/catalog\/acknowledge/);
    expect(sync).toMatch(/set_status\('draft'\)/);
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
    expect(run).toMatch(/COREGUARD_ROOT/);
    const spec = read('apps/web/e2e/coreguard-commerce.spec.ts');
    expect(spec).toMatch(/COREGUARD_ROOT/);
    expect(spec).toMatch(/commerce-results\.json/);
    expect(spec).toMatch(/getByRole\('heading', \{ name: 'Commerce Integrations' \}\)/);
    const commerceUi = read('apps/web/src/components/commerce/company-commerce.tsx');
    expect(commerceUi).toMatch(/Connect your website so BookOne can share stock levels and receive orders/);
    expect(commerceUi).toMatch(/Map products and test sync/);
    expect(commerceUi).toMatch(/Last mapping change/);
    expect(commerceUi).toMatch(/Open Products/);
    expect(commerceUi).toMatch(/Link existing products/);
    expect(commerceUi).toMatch(/Publish from BookOne/);
    expect(commerceUi.indexOf('Link existing products')).toBeGreaterThan(-1);
    expect(commerceUi.indexOf('Link existing products')).toBeLessThan(commerceUi.indexOf('Publish from BookOne'));
    expect(commerceUi).toMatch(/Developers &amp; Integrations/);
    expect(spec).toMatch(/toBe\('posted'\)/);
    expect(spec).toMatch(/toBe\('0'\)/);
    const actions = read('apps/web/src/app/actions/commerce.ts');
    expect(actions).not.toMatch(/issued=/);
    const orders = read('connectors/woocommerce/bookone-commerce/includes/class-bookone-orders.php');
    expect(orders).toMatch(/is_paid\(\)/);
    expect(orders).not.toMatch(/processing.*completed/);
    const worker = read('connectors/woocommerce/bookone-commerce/includes/class-bookone-worker.php');
    expect(worker).toMatch(/bookone_commerce_jobs/);
    expect(worker).toMatch(/status = 'dead'/);
    const playwright = read('apps/web/playwright.coreguard.config.ts');
    expect(playwright).toMatch(/commerce/);
    const e2e = read('apps/web/playwright.config.ts');
    expect(e2e).toMatch(/coreguard-\(custom-bank\|bank-recon\|commerce\)/);
    const docker = read('.github/workflows/docker-web.yml');
    expect(docker).toMatch(/needs: \[quality, coreguard\]/);
    expect(docker).toMatch(/@bookone\/commerce/);
    expect(existsSync(path.join(root, 'docs/commerce/QUICKSTART.md'))).toBe(true);
    expect(existsSync(path.join(root, 'docs/commerce/OPS.md'))).toBe(true);
    expect(existsSync(path.join(root, 'docs/commerce/MATRIX.md'))).toBe(true);
    expect(existsSync(path.join(root, 'docs/commerce/openapi.yaml'))).toBe(true);
    expect(existsSync(path.join(root, 'docs/commerce/quickstart-node.mjs'))).toBe(true);
    const meta = read('apps/web/content/docs/meta.json');
    expect(meta).toMatch(/developers/);
    expect(existsSync(path.join(root, 'apps/web/content/docs/developers/index.mdx'))).toBe(true);
    expect(existsSync(path.join(root, 'apps/web/content/docs/developers/custom-website.mdx'))).toBe(true);
    expect(existsSync(path.join(root, 'apps/web/content/docs/developers/woocommerce.mdx'))).toBe(true);
    expect(existsSync(path.join(root, 'apps/web/content/docs/developers/agentbridge.mdx'))).toBe(true);
    expect(existsSync(path.join(root, 'apps/web/content/docs/developers/errors.mdx'))).toBe(true);
    expect(existsSync(path.join(root, 'apps/web/content/docs/developers/compatibility.mdx'))).toBe(true);
    const pack = read('scripts/commerce/package-plugin.mjs');
    expect(pack).toMatch(/bookone-commerce-1\.2\.0\.zip/);
  });
});
