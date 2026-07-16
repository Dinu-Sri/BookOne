/**
 * Generate 10 demo product WebP photos (400×400) and insert products.
 * Usage from repo root:
 *   pnpm exec tsx scripts/seed-demo-products.ts
 */
import 'dotenv/config';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, isNull, sql } from 'drizzle-orm';
import * as schema from '../packages/db/src/schema';
import sharp from 'sharp';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const DEMO = [
  { sku: 'PHY-PAINT-01', name: 'Emulsion Paint 4L White', type: 'physical', cost: 3200, price: 4800, qty: 24, cat: 'Paint', bg: '#1677c9', accent: '#0d5fa8', label: 'Paint 4L' },
  { sku: 'PHY-BRUSH-02', name: 'Pro Brush Set 5pc', type: 'physical', cost: 850, price: 1450, qty: 40, cat: 'Tools', bg: '#15835f', accent: '#0f6a4c', label: 'Brush Set' },
  { sku: 'PHY-ROLLER-03', name: 'Paint Roller Kit', type: 'physical', cost: 620, price: 1100, qty: 35, cat: 'Tools', bg: '#a76612', accent: '#8a5210', label: 'Roller' },
  { sku: 'PHY-THIN-04', name: 'Paint Thinner 1L', type: 'physical', cost: 480, price: 780, qty: 50, cat: 'Chemicals', bg: '#5855b8', accent: '#4542a0', label: 'Thinner' },
  { sku: 'PHY-TAPE-05', name: 'Masking Tape 50m', type: 'physical', cost: 180, price: 350, qty: 80, cat: 'Consumables', bg: '#c94141', accent: '#a83333', label: 'Tape' },
  { sku: 'DIG-LIC-06', name: 'Design Software License', type: 'digital', cost: 0, price: 12500, qty: 0, cat: 'Software', bg: '#0d5fa8', accent: '#083a67', label: 'License' },
  { sku: 'DIG-EBOOK-07', name: 'Color Theory eBook', type: 'digital', cost: 0, price: 1500, qty: 0, cat: 'Content', bg: '#15835f', accent: '#0b5c42', label: 'eBook' },
  { sku: 'DIG-TEMP-08', name: 'Floor Plan Template Pack', type: 'digital', cost: 0, price: 2900, qty: 0, cat: 'Content', bg: '#a76612', accent: '#7a4a0e', label: 'Templates' },
  { sku: 'SRV-INST-09', name: 'On-site Paint Install', type: 'service', cost: 0, price: 15000, qty: 0, cat: 'Services', bg: '#5855b8', accent: '#3d3a9a', label: 'Install' },
  { sku: 'SRV-CONS-10', name: 'Color Consultation 1hr', type: 'service', cost: 0, price: 5000, qty: 0, cat: 'Services', bg: '#c94141', accent: '#9c3232', label: 'Consult' },
] as const;

async function makeWebp(label: string, bg: string, accent: string) {
  const svg = `
  <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#g)"/>
    <circle cx="200" cy="148" r="70" fill="rgba(255,255,255,0.16)"/>
    <rect x="70" y="248" width="260" height="84" rx="18" fill="rgba(0,0,0,0.18)"/>
    <text x="200" y="298" text-anchor="middle" font-family="Arial, sans-serif"
      font-size="26" font-weight="700" fill="#ffffff">${label.replace(/&/g, '&amp;')}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
}

async function main() {
  const client = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });

  const [tenant] = await db.select().from(schema.tenants).limit(1);
  if (!tenant) {
    console.error('No tenant found. Run pnpm db:seed first.');
    process.exit(1);
  }

  // Prefer committed demo images path under apps/web/public (Docker: /app/...)
  const candidates = [
    path.join(process.cwd(), 'apps', 'web', 'public', 'products', 'demo'),
    path.join(process.cwd(), 'public', 'products', 'demo'),
    path.join('/app', 'apps', 'web', 'public', 'products', 'demo'),
  ];
  let publicDir = candidates.find((p) => existsSync(p)) ?? candidates[0];
  await mkdir(publicDir, { recursive: true });

  console.log(`Seeding demo products for tenant ${tenant.name} (${tenant.id})…`);
  console.log(`Image dir: ${publicDir}`);

  for (const item of DEMO) {
    const filename = `${item.sku.toLowerCase()}.webp`;
    const abs = path.join(publicDir, filename);
    try {
      // Always refresh demo art so deploy images are consistent 400x400 webp
      const webp = await makeWebp(item.label, item.bg, item.accent);
      await writeFile(abs, webp);
    } catch (e) {
      console.warn(`  image write failed for ${filename}:`, e);
    }
    const imageKey = `/products/demo/${filename}`;

    const [existing] = await db
      .select({ id: schema.inventoryProducts.id })
      .from(schema.inventoryProducts)
      .where(
        and(
          eq(schema.inventoryProducts.tenantId, tenant.id),
          eq(schema.inventoryProducts.sku, item.sku),
          isNull(schema.inventoryProducts.voidedAt),
        ),
      )
      .limit(1);

    let productId = existing?.id;
    if (existing) {
      await db
        .update(schema.inventoryProducts)
        .set({
          name: item.name,
          productType: item.type,
          unitCost: item.cost.toFixed(2),
          sellPrice: item.price.toFixed(2),
          category: item.cat,
          imageKey,
          isActive: '1',
          updatedAt: sql`NOW()`,
        })
        .where(eq(schema.inventoryProducts.id, existing.id));
      console.log(`  updated ${item.sku}`);
    } else {
      const [created] = await db
        .insert(schema.inventoryProducts)
        .values({
          tenantId: tenant.id,
          sku: item.sku,
          name: item.name,
          productType: item.type,
          unit: item.type === 'service' ? 'job' : 'ea',
          unitCost: item.cost.toFixed(2),
          sellPrice: item.price.toFixed(2),
          category: item.cat,
          imageKey,
          sellable: '1',
          purchasable: item.type === 'service' ? '0' : '1',
          taxStatus: 'standard',
          isActive: '1',
        })
        .returning({ id: schema.inventoryProducts.id });
      productId = created.id;
      console.log(`  created ${item.sku}`);
    }

    if (item.type === 'physical' && productId) {
      const [level] = await db
        .select()
        .from(schema.inventoryStockLevels)
        .where(
          and(
            eq(schema.inventoryStockLevels.tenantId, tenant.id),
            eq(schema.inventoryStockLevels.productId, productId),
            sql`${schema.inventoryStockLevels.locationId} is null`,
          ),
        )
        .limit(1);
      if (level) {
        await db
          .update(schema.inventoryStockLevels)
          .set({ qtyOnHand: item.qty.toFixed(4), updatedAt: sql`NOW()` })
          .where(eq(schema.inventoryStockLevels.id, level.id));
      } else {
        await db.insert(schema.inventoryStockLevels).values({
          tenantId: tenant.id,
          productId,
          locationId: null,
          qtyOnHand: item.qty.toFixed(4),
        });
      }
    }
  }

  console.log('Done. 10 demo products with 400×400 WebP photos.');
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
