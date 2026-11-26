import { createHash } from 'crypto';
import sharp from 'sharp';
import {
  and,
  commerceChannelProducts,
  db,
  eq,
  inventoryMovements,
  inventoryProductBrands,
  inventoryProductCategories,
  inventoryProductImages,
  inventoryProducts,
  inventoryStockLevels,
  isNull,
  sql,
} from '@bookone/db';
import { receiveCostLayer } from '@/lib/inventory-costing';

/**
 * Commerce WP1 sandbox data: a sample art-supplies catalog so a website team can
 * test a full import (brands, a category tree, variable products with colour
 * variants, gallery images ≥ 1600 px, weights, stock) and publish it to a
 * sandbox channel. Every SKU starts with SAMPLE-. Stock has zero cost, so no
 * journals are posted and the books are unchanged. Safe to run twice.
 */

const BRANDS = [
  { name: 'Sample Brand Aqua', site: 'https://example.com/aqua' },
  { name: 'Sample Brand Fibre', site: 'https://example.com/fibre' },
  { name: 'Sample Brand Paper Mill', site: 'https://example.com/paper' },
];

const COLOURS = [
  { name: 'Chinese White', hex: '#F7F5EE' },
  { name: 'Lemon Yellow', hex: '#F2E14C' },
  { name: 'Cadmium Red', hex: '#D7262E' },
  { name: 'Ultramarine', hex: '#2747A8' },
  { name: 'Sap Green', hex: '#4E7A2D' },
  { name: 'Burnt Sienna', hex: '#A0522D' },
];

type Simple = { sku: string; name: string; price: number; weight: number; brand: number; cat: string; qty: number; attrs: Record<string, string> };

const SIMPLES: Simple[] = [
  ...[0, 2, 4, 6, 8, 10, 12, 14].map((size, i) => ({
    sku: `SAMPLE-BRUSH-R${size}`,
    name: `Round Brush Size ${size}`,
    price: 450 + i * 60,
    weight: 12 + i,
    brand: 1,
    cat: 'Brushes',
    qty: 8 + i,
    attrs: { brush_size: String(size), hair: 'synthetic' },
  })),
  ...['A5', 'A4', 'A3'].flatMap((size, i) =>
    ['Cold press', 'Hot press'].map((surface, j) => ({
      sku: `SAMPLE-PAD-${size}-${j ? 'HP' : 'CP'}`,
      name: `Watercolour Pad ${size} ${surface} 300gsm`,
      price: 1200 + i * 650 + j * 150,
      weight: 220 + i * 180,
      brand: 2,
      cat: 'Paper and Pads',
      qty: 6 + i,
      attrs: { paper_size: size, surface: surface.toLowerCase(), gsm: '300' },
    })),
  ),
  { sku: 'SAMPLE-PALETTE-24', name: 'Folding Palette 24 Wells', price: 980, weight: 140, brand: 0, cat: 'Accessories', qty: 5, attrs: { wells: '24' } },
  { sku: 'SAMPLE-JAR', name: 'Collapsible Water Jar', price: 650, weight: 90, brand: 0, cat: 'Accessories', qty: 7, attrs: {} },
  { sku: 'SAMPLE-TAPE', name: 'Masking Tape 24mm', price: 320, weight: 60, brand: 2, cat: 'Accessories', qty: 12, attrs: {} },
  ...['2H', 'HB', '2B', '4B', '6B', '8B'].map((grade, i) => ({
    sku: `SAMPLE-PENCIL-${grade}`,
    name: `Graphite Pencil ${grade}`,
    price: 120 + i * 10,
    weight: 8,
    brand: 1,
    cat: 'Pencils and Sketching',
    qty: 30,
    attrs: { grade },
  })),
  ...['A5', 'A4', 'A3', 'Square 20cm'].map((size, i) => ({
    sku: `SAMPLE-SKETCH-${size.replace(/[^A-Z0-9]+/gi, '').toUpperCase()}`,
    name: `Sketchbook ${size} 110gsm`,
    price: 850 + i * 300,
    weight: 300 + i * 150,
    brand: 2,
    cat: 'Pencils and Sketching',
    qty: 10,
    attrs: { paper_size: size, gsm: '110' },
  })),
];

async function sampleImage(label: string, color: string): Promise<{ webp: Buffer; checksum: string }> {
  const svg = `<svg width="1600" height="1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="1600" fill="#f4f1ea"/>
    <circle cx="800" cy="700" r="420" fill="${color}"/>
    <text x="800" y="1360" text-anchor="middle" font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="#333">${label
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .slice(0, 28)}</text>
  </svg>`;
  const webp = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  return { webp, checksum: `sha256:${createHash('sha256').update(webp).digest('hex')}` };
}

export async function seedSampleCatalog(opts: {
  tenantId: string;
  userId: string;
  connectionId: string;
  locationId: string | null;
}): Promise<{ products: number; published: number; images: number }> {
  const { tenantId } = opts;
  const { saveProductThumbWebp, storeSampleGalleryWebp } = await import('@/lib/product-image');
  const today = new Date().toISOString().slice(0, 10);

  // Brands
  const brandIds: string[] = [];
  for (const b of BRANDS) {
    const [hit] = await db()
      .select({ id: inventoryProductBrands.id })
      .from(inventoryProductBrands)
      .where(and(eq(inventoryProductBrands.tenantId, tenantId), eq(inventoryProductBrands.name, b.name), isNull(inventoryProductBrands.voidedAt)))
      .limit(1);
    if (hit) brandIds.push(hit.id);
    else {
      const [row] = await db().insert(inventoryProductBrands).values({ tenantId, name: b.name, websiteUrl: b.site }).returning({ id: inventoryProductBrands.id });
      brandIds.push(row!.id);
    }
  }

  // Category tree: Sample Art Supplies > Paints > Watercolour Paints, Brushes, Paper and Pads, Accessories
  async function category(name: string, parentId: string | null): Promise<string> {
    const [hit] = await db()
      .select({ id: inventoryProductCategories.id })
      .from(inventoryProductCategories)
      .where(and(eq(inventoryProductCategories.tenantId, tenantId), eq(inventoryProductCategories.name, name), isNull(inventoryProductCategories.voidedAt)))
      .limit(1);
    if (hit) return hit.id;
    const [row] = await db().insert(inventoryProductCategories).values({ tenantId, name, parentId }).returning({ id: inventoryProductCategories.id });
    return row!.id;
  }
  const root = await category('Sample Art Supplies', null);
  const paints = await category('Paints', root);
  const cats: Record<string, string> = {
    'Watercolour Paints': await category('Watercolour Paints', paints),
    Brushes: await category('Brushes', root),
    'Paper and Pads': await category('Paper and Pads', root),
    Accessories: await category('Accessories', root),
    'Pencils and Sketching': await category('Pencils and Sketching', root),
  };

  let created = 0;
  let images = 0;
  const publish: string[] = [];

  async function upsertProduct(values: Record<string, unknown> & { sku: string; name: string }): Promise<{ id: string; isNew: boolean }> {
    const [hit] = await db()
      .select({ id: inventoryProducts.id })
      .from(inventoryProducts)
      .where(and(eq(inventoryProducts.tenantId, tenantId), sql`lower(${inventoryProducts.sku}) = lower(${values.sku})`, isNull(inventoryProducts.voidedAt)))
      .limit(1);
    if (hit) return { id: hit.id, isNew: false };
    const [row] = await db()
      .insert(inventoryProducts)
      .values({ tenantId, unitCost: '0', taxStatus: 'standard', ...values } as typeof inventoryProducts.$inferInsert)
      .returning({ id: inventoryProducts.id });
    created += 1;
    return { id: row!.id, isNew: true };
  }

  async function addImage(productId: string, label: string, color: string, position: number, withThumb: boolean) {
    const { webp, checksum } = await sampleImage(label, color);
    const key = await storeSampleGalleryWebp({ tenantId, productId, webp });
    await db().insert(inventoryProductImages).values({ tenantId, productId, storageKey: key, width: 1600, height: 1600, alt: label, position, checksum });
    images += 1;
    if (withThumb) {
      const thumb = await sharp(webp).resize(400, 400).webp({ quality: 78 }).toBuffer();
      const { imageKey } = await saveProductThumbWebp({ tenantId, productId, webp: thumb });
      await db().update(inventoryProducts).set({ imageKey }).where(eq(inventoryProducts.id, productId));
    }
  }

  async function addStock(productId: string, qty: number) {
    await db()
      .insert(inventoryStockLevels)
      .values({ tenantId, productId, locationId: opts.locationId, qtyOnHand: qty.toFixed(4) })
      .onConflictDoNothing();
    await receiveCostLayer({ tenantId, productId, locationId: opts.locationId, qty, unitCost: 0, date: today, sourceType: 'opening', sourceId: productId });
    await db().insert(inventoryMovements).values({
      tenantId,
      userId: opts.userId,
      movementType: 'adjustment',
      productId,
      quantity: qty.toFixed(4),
      unitCost: '0.00',
      toLocationId: opts.locationId,
      referenceType: 'opening',
      referenceId: productId,
      memo: 'Sample catalog opening stock (zero cost)',
      movementDate: today,
    });
  }

  // Variable products: 3 paint ranges × 6 colours = 18 variants
  const ranges = [
    { sku: 'SAMPLE-WC-8ML', name: 'Student Watercolour 8ml Tube', price: 690, weight: 25, brand: 0 },
    { sku: 'SAMPLE-WC-14ML', name: 'Artist Watercolour 14ml Tube', price: 1650, weight: 40, brand: 0 },
    { sku: 'SAMPLE-WC-HALF', name: 'Watercolour Half Pan', price: 520, weight: 10, brand: 1 },
  ];
  for (const range of ranges) {
    const parent = await upsertProduct({
      sku: range.sku,
      name: range.name,
      shortName: range.name.replace('Watercolour ', ''),
      description: `<p>${range.name} in ${COLOURS.length} colours.</p>`,
      longDescription: `<p>${range.name}. Highly pigmented, lightfast colours for students and artists.</p>`,
      productType: 'service',
      sellable: '0',
      purchasable: '0',
      sellPrice: range.price.toFixed(2),
      categoryId: cats['Watercolour Paints'],
      productBrandId: brandIds[range.brand],
      productOptions: [{ name: 'Colour', values: COLOURS.map((c) => c.name) }],
      weightGrams: range.weight,
      tags: ['sample', 'watercolour'],
      attributeValues: [{ code: 'pigment_count', value: '1' }],
    });
    if (parent.isNew) await addImage(parent.id, range.name, '#6b8fbf', 1, true);
    publish.push(parent.id);
    for (const [i, colour] of COLOURS.entries()) {
      const variant = await upsertProduct({
        sku: `${range.sku}-${colour.name.toUpperCase().replace(/[^A-Z]+/g, '').slice(0, 6)}`,
        name: `${range.name} ${colour.name}`,
        productType: 'physical',
        sellPrice: range.price.toFixed(2),
        categoryId: cats['Watercolour Paints'],
        productBrandId: brandIds[range.brand],
        parentProductId: parent.id,
        variantOptions: [{ name: 'Colour', value: colour.name }],
        swatchHex: colour.hex,
        variantSortOrder: i,
        isDefaultVariant: i === 0 ? '1' : '0',
        weightGrams: range.weight,
        barcode: `9790000${String(ranges.indexOf(range) * 10 + i).padStart(5, '0')}`,
      });
      if (variant.isNew) {
        await addImage(variant.id, colour.name, colour.hex, 1, true);
        await addStock(variant.id, 4 + i * 2);
      }
    }
  }

  for (const s of SIMPLES) {
    const p = await upsertProduct({
      sku: s.sku,
      name: s.name,
      description: `<p>${s.name}.</p>`,
      productType: 'physical',
      sellPrice: s.price.toFixed(2),
      categoryId: cats[s.cat],
      productBrandId: brandIds[s.brand],
      weightGrams: s.weight,
      tags: ['sample'],
      attributeValues: Object.entries(s.attrs).map(([code, value]) => ({ code, value })),
    });
    if (p.isNew) {
      await addImage(p.id, s.name, '#9aa5b1', 1, true);
      await addStock(p.id, s.qty);
    }
    publish.push(p.id);
  }

  if (publish.length) {
    await db()
      .insert(commerceChannelProducts)
      .values(publish.map((productId) => ({ tenantId, connectionId: opts.connectionId, productId })))
      .onConflictDoNothing();
  }
  return { products: created, published: publish.length, images };
}
