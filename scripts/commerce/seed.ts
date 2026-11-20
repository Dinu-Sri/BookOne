import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import type { PilotSeed } from '../coreguard/seed';

export type CommerceSeed = {
  tenantId: string;
  locationId: string;
  productId: string;
  variantId: string;
  sku: string;
  variantSku: string;
  wooToken: string;
  httpToken: string;
  wooConnectionId: string;
  httpConnectionId: string;
};

function hashSecret(secret: string, pepper: string) {
  return createHash('sha256').update(`${pepper}:${secret}`).digest('hex');
}

export async function seedCommerceFixture(databaseUrl: string, seed: PilotSeed): Promise<CommerceSeed> {
  const sql = postgres(databaseUrl, { max: 1 });
  const tenantId = seed.companies.alpha.tenantId;
  const userId = seed.companies.alpha.owner.id;
  const pepper = process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET ?? 'test-secret-for-ci-only';
  try {
    await sql`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
    await sql`
      UPDATE tenants
      SET modules = jsonb_set(jsonb_set(modules, '{inventory}', 'true'::jsonb, true), '{sales}', 'true'::jsonb, true)
      WHERE id = ${tenantId}
    `;
    const locationId = randomUUID();
    await sql`
      INSERT INTO locations (id, tenant_id, name, code, location_type, status)
      VALUES (${locationId}, ${tenantId}, 'Main', 'MAIN', 'branch', 'active')
    `;
    const productId = randomUUID();
    const variantId = randomUUID();
    await sql`
      INSERT INTO inventory_products (id, tenant_id, sku, name, product_type, unit, unit_cost, sell_price, sellable, is_active)
      VALUES
        (${productId}, ${tenantId}, 'SKU-1', 'Pilot mug', 'physical', 'each', '400.00', '1500.00', '1', '1'),
        (${variantId}, ${tenantId}, 'SKU-VAR', 'Pilot mug / blue', 'physical', 'each', '400.00', '1500.00', '1', '1')
    `;
    await sql`
      INSERT INTO inventory_stock_levels (id, tenant_id, product_id, location_id, qty_on_hand)
      VALUES
        (${randomUUID()}, ${tenantId}, ${productId}, ${locationId}, '1'),
        (${randomUUID()}, ${tenantId}, ${variantId}, ${locationId}, '2')
    `;
    const wooConnectionId = randomUUID();
    const httpConnectionId = randomUUID();
    await sql`
      INSERT INTO commerce_connections (
        id, tenant_id, created_by_user_id, name, kind, environment, location_id, currency, posting_mode
      ) VALUES
        (${wooConnectionId}, ${tenantId}, ${userId}, 'Woo sandbox', 'woocommerce', 'sandbox', ${locationId}, 'LKR', 'posting'),
        (${httpConnectionId}, ${tenantId}, ${userId}, 'Generic HTTP', 'custom_website', 'sandbox', ${locationId}, 'LKR', 'posting')
    `;
    const wooSecret = 'woo' + 'a'.repeat(45);
    const httpSecret = 'http' + 'b'.repeat(44);
    const wooPrefix = 'cgwoo0000001';
    const httpPrefix = 'cghttp000001';
    await sql`
      INSERT INTO commerce_credentials (
        id, tenant_id, connection_id, created_by_user_id, prefix, secret_hash, scopes, status
      ) VALUES
        (${randomUUID()}, ${tenantId}, ${wooConnectionId}, ${userId}, ${wooPrefix}, ${hashSecret(wooSecret, pepper)}, 'catalog,inventory,order,lifecycle', 'active'),
        (${randomUUID()}, ${tenantId}, ${httpConnectionId}, ${userId}, ${httpPrefix}, ${hashSecret(httpSecret, pepper)}, 'catalog,inventory,order,lifecycle', 'active')
    `;
    await sql`
      INSERT INTO commerce_product_mappings (
        id, tenant_id, connection_id, bookone_product_id, sku, external_product_id, external_variant_id
      ) VALUES
        (${randomUUID()}, ${tenantId}, ${wooConnectionId}, ${productId}, 'SKU-1', 'woo-1', ''),
        (${randomUUID()}, ${tenantId}, ${wooConnectionId}, ${variantId}, 'SKU-VAR', 'woo-2', 'woo-2-blue'),
        (${randomUUID()}, ${tenantId}, ${httpConnectionId}, ${productId}, 'SKU-1', 'http-1', ''),
        (${randomUUID()}, ${tenantId}, ${httpConnectionId}, ${variantId}, 'SKU-VAR', 'http-2', 'http-2-blue')
    `;
    return {
      tenantId,
      locationId,
      productId,
      variantId,
      sku: 'SKU-1',
      variantSku: 'SKU-VAR',
      wooToken: `bkc_sand_${wooPrefix}_${wooSecret}`,
      httpToken: `bkc_sand_${httpPrefix}_${httpSecret}`,
      wooConnectionId,
      httpConnectionId,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
