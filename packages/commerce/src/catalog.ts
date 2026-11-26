/**
 * Commerce WP1 — catalog read model for websites.
 *
 * The store hands over a raw bundle (products, variants, images, categories,
 * brands, attributes, stock, publish set). This module turns it into the API
 * objects, applies publishing, filters and keyset paging. It is pure so it can
 * be tested without a database.
 */
import { createHash } from 'node:crypto';
import { channelPrice, pickPriceList, type PriceListRaw } from './pricing';

export type CatalogProductRaw = {
  id: string;
  sku: string;
  name: string;
  shortName: string | null;
  description: string | null;
  longDescription: string | null;
  productType: string;
  unit: string;
  sellPrice: string;
  categoryId: string | null;
  productBrandId: string | null;
  barcode: string | null;
  extraBarcodes: string[];
  tags: string[];
  attributeValues: Array<{ code: string; value: string }>;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  fragile: boolean;
  taxStatus: string;
  minOrderQty: string | null;
  maxOrderQty: string | null;
  orderQtyStep: string | null;
  allowBackorder: boolean;
  parentProductId: string | null;
  variantOptions: Array<{ name: string; value: string }>;
  productOptions: Array<{ name: string; values: string[] }>;
  swatchHex: string | null;
  variantSortOrder: number;
  isDefaultVariant: boolean;
  sellable: boolean;
  isActive: boolean;
  archived: boolean;
  /** Legacy single 400×400 photo; used when the product has no gallery. */
  imageKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CatalogImageRaw = {
  id: string;
  productId: string;
  width: number;
  height: number;
  alt: string | null;
  position: number;
  checksum: string;
  updatedAt: string;
};

export type CatalogCategoryRaw = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  archived: boolean;
  updatedAt: string;
};

export type CatalogBrandRaw = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  archived: boolean;
  updatedAt: string;
};

export type CatalogAttributeRaw = {
  code: string;
  name: string;
  type: string;
  unit: string | null;
  allowedValues: string[];
  filterable: boolean;
};

export type ChannelSettings = {
  /** Units held back from what the website may sell (e.g. 1). */
  safetyBuffer: number;
  /** Channel-wide: let the website take orders when available is 0. */
  allowBackorder: boolean;
  timezone: string;
  /** WP2 C2: the price list this channel sells at; null = BookOne sell price. */
  priceListId?: string | null;
};

export const DEFAULT_CHANNEL_SETTINGS: ChannelSettings = { safetyBuffer: 0, allowBackorder: false, timezone: 'Asia/Colombo', priceListId: null };

export type CatalogBundle = {
  products: CatalogProductRaw[];
  images: CatalogImageRaw[];
  categories: CatalogCategoryRaw[];
  brands: CatalogBrandRaw[];
  attributes: CatalogAttributeRaw[];
  /** Explicitly published product ids for this channel. */
  published: Set<string>;
  /** Linked products (mapping) with the store's ids. Linked products also count as published. */
  mapped: Map<string, { externalProductId: string; externalVariantId: string }>;
  onHand: Map<string, number>;
  committed: Map<string, number>;
  currency: string;
  vatRatePercent: number;
  vatRegistered: boolean;
  channel: ChannelSettings;
  /** WP2: every active price list with its entries. */
  priceLists?: PriceListRaw[];
};

export type CatalogInclude = 'variants' | 'images' | 'prices' | 'inventory' | 'attributes';
export const ALL_INCLUDES: CatalogInclude[] = ['variants', 'images', 'prices', 'inventory', 'attributes'];

export type CatalogQuery = {
  cursor?: string | null;
  limit?: number;
  updatedSince?: string | null;
  status?: 'active' | 'archived' | 'all';
  categoryId?: string | null;
  brandId?: string | null;
  skus?: string[];
  include?: CatalogInclude[];
  /** 'all' ignores channel publishing (every sellable product). */
  scope?: 'published' | 'all';
  /** Absolute base for image URLs, e.g. https://host/api/commerce/media/<tenant>. */
  mediaBase: string;
  /** WP2 PR5: price with this customer group's list when one exists. */
  customerGroup?: string | null;
};

export const MAX_PAGE = 250;
export const DEFAULT_PAGE = 50;

export function clampLimit(raw: number | undefined): number {
  if (!raw || !Number.isFinite(raw)) return DEFAULT_PAGE;
  return Math.min(MAX_PAGE, Math.max(1, Math.floor(raw)));
}

export function parseInclude(raw: string | null | undefined): CatalogInclude[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is CatalogInclude => (ALL_INCLUDES as string[]).includes(s));
}

export function slugHint(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function toMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function maxIso(values: string[]): string {
  let best = values[0] ?? new Date(0).toISOString();
  for (const v of values) if (toMs(v) > toMs(best)) best = v;
  return best;
}

function money(value: string | number): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function qty(n: number): string {
  const v = Math.round(n * 10000) / 10000;
  return String(Object.is(v, -0) ? 0 : v);
}

function decimalOrNull(v: string | null): string | null {
  if (v === null || v === undefined || v === '') return null;
  return qty(Number(v));
}

function unitFor(unit: string) {
  const code = unit.trim().toLowerCase() || 'each';
  const names: Record<string, { code: string; name: string; decimals: number }> = {
    each: { code: 'pcs', name: 'Piece', decimals: 0 },
    pcs: { code: 'pcs', name: 'Piece', decimals: 0 },
    piece: { code: 'pcs', name: 'Piece', decimals: 0 },
    kg: { code: 'kg', name: 'Kilogram', decimals: 3 },
    g: { code: 'g', name: 'Gram', decimals: 0 },
    l: { code: 'l', name: 'Litre', decimals: 3 },
    ml: { code: 'ml', name: 'Millilitre', decimals: 0 },
    m: { code: 'm', name: 'Metre', decimals: 2 },
    hour: { code: 'hour', name: 'Hour', decimals: 2 },
  };
  return names[code] ?? { code, name: unit, decimals: 2 };
}

function taxFor(p: CatalogProductRaw, b: CatalogBundle) {
  const status = p.taxStatus;
  const category = status === 'exempt' ? 'exempt' : status === 'zero' || status === 'zero_rated' ? 'zero' : 'standard';
  const rate = category === 'standard' && b.vatRegistered ? b.vatRatePercent : 0;
  return { taxCategory: category, rate: money(rate) };
}

function htmlToText(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Stable image URL; the checksum segment changes when the bytes change. */
export function imageUrl(mediaBase: string, imageId: string, checksum: string): string {
  const short = checksum.replace(/^sha256:/, '').slice(0, 12);
  return `${mediaBase.replace(/\/$/, '')}/${encodeURIComponent(imageId)}/${short}.webp`;
}

function imagesFor(p: CatalogProductRaw, b: CatalogBundle, mediaBase: string) {
  const rows = b.images.filter((img) => img.productId === p.id).sort((a, c) => a.position - c.position);
  if (!rows.length && p.imageKey) {
    const checksum = `sha256:${createHash('sha256').update(p.imageKey).digest('hex')}`;
    return [
      {
        id: `p_${p.id}`,
        url: imageUrl(mediaBase, `p_${p.id}`, checksum),
        width: 400,
        height: 400,
        alt: p.name,
        position: 1,
        checksum,
        updatedAt: p.updatedAt,
      },
    ];
  }
  return rows.map((img, i) => ({
    id: img.id,
    url: imageUrl(mediaBase, img.id, img.checksum),
    width: img.width,
    height: img.height,
    alt: img.alt ?? p.name,
    position: i + 1,
    checksum: img.checksum,
    updatedAt: img.updatedAt,
  }));
}

function inventoryFor(p: CatalogProductRaw, b: CatalogBundle) {
  const tracked = p.productType === 'physical' || p.productType === 'rental';
  const onHand = b.onHand.get(p.id) ?? 0;
  const committed = b.committed.get(p.id) ?? 0;
  const available = tracked ? Math.max(0, onHand - committed - b.channel.safetyBuffer) : null;
  return {
    trackInventory: tracked,
    onHand: tracked ? qty(onHand) : null,
    committed: tracked ? qty(committed) : null,
    available: available === null ? null : qty(available),
    allowBackorder: p.allowBackorder || b.channel.allowBackorder,
    revision: Math.max(toMs(p.updatedAt), 0),
    asOf: new Date().toISOString(),
  };
}

/** The list this request prices with (customer group, else the channel's). */
export function activeList(b: CatalogBundle, customerGroup?: string | null): PriceListRaw | null {
  return pickPriceList(b.priceLists ?? [], b.channel.priceListId ?? null, customerGroup);
}

function priceFor(p: CatalogProductRaw, b: CatalogBundle, list: PriceListRaw | null = activeList(b)) {
  return channelPrice(p, list, b.currency);
}

function attributesFor(p: CatalogProductRaw, b: CatalogBundle) {
  return p.attributeValues
    .filter((a) => a.code)
    .map((a) => ({ code: a.code, name: b.attributes.find((d) => d.code === a.code)?.name ?? a.code, value: a.value }));
}

function categoryPath(categoryId: string | null, b: CatalogBundle): string[] {
  const path: string[] = [];
  let id = categoryId;
  const guard = new Set<string>();
  while (id && !guard.has(id)) {
    guard.add(id);
    const c = b.categories.find((x) => x.id === id);
    if (!c) break;
    path.unshift(c.name);
    id = c.parentId;
  }
  return path;
}

function categoryAndDescendants(id: string, b: CatalogBundle): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of b.categories) {
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
    }
  }
  return out;
}

export type CatalogProduct = Record<string, unknown> & { id: string; sku: string; revision: number; updatedAt: string };

/** Products this channel may see, with their published variants. */
export function visibleTree(b: CatalogBundle, scope: 'published' | 'all') {
  const isOn = (id: string) => scope === 'all' || b.published.has(id) || b.mapped.has(id);
  const children = new Map<string, CatalogProductRaw[]>();
  for (const p of b.products) {
    if (p.parentProductId) {
      const list = children.get(p.parentProductId) ?? [];
      list.push(p);
      children.set(p.parentProductId, list);
    }
  }
  const out: Array<{ product: CatalogProductRaw; variants: CatalogProductRaw[] }> = [];
  for (const p of b.products) {
    if (p.parentProductId) continue;
    const kids = (children.get(p.id) ?? []).sort((a, c) => a.variantSortOrder - c.variantSortOrder || a.sku.localeCompare(c.sku));
    const variable = p.productType === 'variable' || p.productOptions.length > 0 || kids.length > 0;
    if (variable) {
      const shown = isOn(p.id) ? kids : kids.filter((k) => isOn(k.id));
      if (!shown.length && !isOn(p.id)) continue;
      out.push({ product: p, variants: shown });
    } else {
      if (!isOn(p.id)) continue;
      if (!p.sellable && scope === 'all') continue;
      out.push({ product: p, variants: [] });
    }
  }
  return out;
}

function statusOf(p: CatalogProductRaw): 'active' | 'archived' {
  return p.archived || !p.isActive ? 'archived' : 'active';
}

export function buildProduct(
  entry: { product: CatalogProductRaw; variants: CatalogProductRaw[] },
  b: CatalogBundle,
  include: Set<CatalogInclude>,
  mediaBase: string,
  list: PriceListRaw | null = activeList(b),
): CatalogProduct {
  const p = entry.product;
  const variable = p.productType === 'variable' || p.productOptions.length > 0 || entry.variants.length > 0;
  const brand = p.productBrandId ? b.brands.find((x) => x.id === p.productBrandId) : null;
  const category = p.categoryId ? b.categories.find((c) => c.id === p.categoryId) : null;
  const ownImages = include.has('images') ? imagesFor(p, b, mediaBase) : null;
  const updatedAt = maxIso([
    p.updatedAt,
    ...entry.variants.map((v) => v.updatedAt),
    ...b.images.filter((img) => img.productId === p.id || entry.variants.some((v) => v.id === img.productId)).map((i) => i.updatedAt),
  ]);
  const type = variable ? 'variable' : p.productType === 'service' || p.productType === 'digital' ? 'service' : 'simple';
  const options =
    p.productOptions.length > 0
      ? p.productOptions
      : variable
        ? deriveOptions(entry.variants)
        : [];
  const mapped = b.mapped.get(p.id);
  const out: CatalogProduct = {
    id: p.id,
    sku: p.sku,
    type,
    status: statusOf(p),
    name: p.name,
    shortName: p.shortName ?? null,
    slugHint: slugHint(p.name),
    descriptionHtml: p.longDescription ?? p.description ?? null,
    descriptionText: htmlToText(p.longDescription ?? p.description),
    shortDescriptionHtml: p.description ?? null,
    brand: brand ? { id: brand.id, name: brand.name } : null,
    categories: category ? [{ id: category.id, name: category.name, path: categoryPath(category.id, b), primary: true }] : [],
    unit: unitFor(p.unit),
    barcodes: [p.barcode, ...p.extraBarcodes].filter((x): x is string => Boolean(x)),
    tags: p.tags,
    shipping: shippingFor(p),
    tax: taxFor(p, b),
    trackInventory: !variable && (p.productType === 'physical' || p.productType === 'rental'),
    allowBackorder: p.allowBackorder || b.channel.allowBackorder,
    minOrderQty: decimalOrNull(p.minOrderQty) ?? '1',
    maxOrderQty: decimalOrNull(p.maxOrderQty),
    orderQtyStep: decimalOrNull(p.orderQtyStep) ?? '1',
    options,
    externalProductId: mapped?.externalProductId ?? null,
    revision: toMs(updatedAt),
    createdAt: p.createdAt,
    updatedAt,
  };
  if (include.has('attributes')) out.attributes = attributesFor(p, b);
  if (ownImages) out.images = ownImages;
  if (!variable) {
    if (include.has('prices')) out.price = priceFor(p, b, list);
    if (include.has('inventory')) out.inventory = inventoryFor(p, b);
  }
  if (include.has('variants')) {
    out.variants = entry.variants.map((v) => {
      const vm = b.mapped.get(v.id);
      const variant: Record<string, unknown> = {
        id: v.id,
        sku: v.sku,
        barcodes: [v.barcode, ...v.extraBarcodes].filter((x): x is string => Boolean(x)),
        options: v.variantOptions,
        swatch: v.swatchHex ? { hex: v.swatchHex, imageId: null } : null,
        status: statusOf(v),
        sortOrder: v.variantSortOrder,
        isDefault: v.isDefaultVariant,
        shipping: shippingFor(v, p),
        externalVariantId: vm?.externalVariantId || vm?.externalProductId || null,
        revision: toMs(v.updatedAt),
        updatedAt: v.updatedAt,
      };
      if (include.has('images')) variant.images = imagesFor(v, b, mediaBase).filter((img) => !img.id.startsWith('p_') || v.imageKey);
      if (include.has('prices')) variant.price = priceFor(v, b, list);
      if (include.has('inventory')) variant.inventory = inventoryFor(v, b);
      if (include.has('attributes')) variant.attributes = attributesFor(v, b);
      return variant;
    });
  }
  return out;
}

function shippingFor(p: CatalogProductRaw, parent?: CatalogProductRaw) {
  return {
    weightGrams: p.weightGrams ?? parent?.weightGrams ?? null,
    lengthMm: p.lengthMm ?? parent?.lengthMm ?? null,
    widthMm: p.widthMm ?? parent?.widthMm ?? null,
    heightMm: p.heightMm ?? parent?.heightMm ?? null,
    fragile: p.fragile || Boolean(parent?.fragile),
  };
}

function deriveOptions(variants: CatalogProductRaw[]): Array<{ name: string; values: string[] }> {
  const map = new Map<string, string[]>();
  for (const v of variants) {
    for (const o of v.variantOptions) {
      const list = map.get(o.name) ?? [];
      if (!list.includes(o.value)) list.push(o.value);
      map.set(o.name, list);
    }
  }
  return [...map.entries()].map(([name, values]) => ({ name, values }));
}

type Cursor = { u: number; id: string };

export function encodeCatalogCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCatalogCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    if (typeof c.u === 'number' && typeof c.id === 'string') return c;
  } catch {
    // fall through
  }
  return null;
}

/**
 * Keyset page ordered by (revision, id) ascending, so a client can import the
 * whole catalog and then poll with updatedSince without missing rows.
 */
export function catalogPage(b: CatalogBundle, q: CatalogQuery): { items: CatalogProduct[]; nextCursor: string | null } {
  const include = new Set(q.include ?? []);
  const limit = clampLimit(q.limit);
  const status = q.status ?? 'active';
  const since = q.updatedSince ? Date.parse(q.updatedSince) : NaN;
  const skuSet = q.skus?.length ? new Set(q.skus) : null;
  const cats = q.categoryId ? categoryAndDescendants(q.categoryId, b) : null;
  const after = decodeCatalogCursor(q.cursor);
  const list = activeList(b, q.customerGroup);
  const all = visibleTree(b, q.scope ?? 'published')
    .map((entry) => buildProduct(entry, b, new Set<CatalogInclude>([...include, 'variants']), q.mediaBase, list))
    .filter((prod) => {
      if (status !== 'all' && prod.status !== status) return false;
      if (Number.isFinite(since) && prod.revision <= since) return false;
      if (q.brandId && (prod.brand as { id: string } | null)?.id !== q.brandId) return false;
      if (cats && !(prod.categories as Array<{ id: string }>).some((c) => cats.has(c.id))) return false;
      if (skuSet) {
        const variants = (prod.variants as Array<{ sku: string }>) ?? [];
        if (!skuSet.has(prod.sku) && !variants.some((v) => skuSet.has(v.sku))) return false;
      }
      return true;
    })
    .sort((a, c) => a.revision - c.revision || a.id.localeCompare(c.id));
  const start = after ? all.findIndex((p) => p.revision > after.u || (p.revision === after.u && p.id > after.id)) : 0;
  const from = start < 0 ? all.length : start;
  const page = all.slice(from, from + limit).map((p) => (include.has('variants') ? p : stripVariants(p)));
  const last = page[page.length - 1];
  const nextCursor = from + limit < all.length && last ? encodeCatalogCursor({ u: last.revision, id: last.id }) : null;
  return { items: page, nextCursor };
}

function stripVariants(p: CatalogProduct): CatalogProduct {
  const { variants, ...rest } = p;
  void variants;
  return rest as CatalogProduct;
}

export function findCatalogProduct(
  b: CatalogBundle,
  match: { id?: string; sku?: string },
  include: CatalogInclude[],
  mediaBase: string,
  scope: 'published' | 'all' = 'published',
  customerGroup?: string | null,
): CatalogProduct | null {
  const inc = new Set(include);
  for (const entry of visibleTree(b, scope)) {
    const hit =
      (match.id && (entry.product.id === match.id || entry.variants.some((v) => v.id === match.id))) ||
      (match.sku && (entry.product.sku === match.sku || entry.variants.some((v) => v.sku === match.sku)));
    if (hit) {
      const built = buildProduct(entry, b, new Set<CatalogInclude>([...inc, 'variants']), mediaBase, activeList(b, customerGroup));
      return inc.has('variants') ? built : stripVariants(built);
    }
  }
  return null;
}

export function categoryList(b: CatalogBundle) {
  return b.categories
    .map((c) => ({
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      slugHint: c.slug || slugHint(c.name),
      description: c.description,
      imageUrl: c.imageUrl,
      sortOrder: c.sortOrder,
      status: c.archived ? 'archived' : 'active',
      updatedAt: c.updatedAt,
    }))
    .sort((a, c) => a.sortOrder - c.sortOrder || a.name.localeCompare(c.name));
}

export function brandList(b: CatalogBundle) {
  return b.brands
    .map((x) => ({
      id: x.id,
      name: x.name,
      slugHint: x.slug || slugHint(x.name),
      logoUrl: x.logoUrl,
      description: x.description,
      websiteUrl: x.websiteUrl,
      status: x.archived ? 'archived' : 'active',
      updatedAt: x.updatedAt,
    }))
    .sort((a, c) => a.name.localeCompare(c.name));
}

/** Offset paging for the small reference lists (categories, brands, attributes). */
export function pageOf<T>(items: T[], cursor: string | null | undefined, limitRaw?: number): { items: T[]; nextCursor: string | null } {
  const limit = clampLimit(limitRaw);
  const start = cursor ? Number(Buffer.from(cursor, 'base64url').toString('utf8')) || 0 : 0;
  const page = items.slice(start, start + limit);
  const next = start + limit < items.length ? Buffer.from(String(start + limit)).toString('base64url') : null;
  return { items: page, nextCursor: next };
}

/** Products published to the channel that have no shipping weight (website delivery needs it). */
export function missingWeight(b: CatalogBundle): Array<{ id: string; sku: string; name: string }> {
  const out: Array<{ id: string; sku: string; name: string }> = [];
  for (const entry of visibleTree(b, 'published')) {
    const p = entry.product;
    if (entry.variants.length) {
      for (const v of entry.variants) {
        if ((v.weightGrams ?? p.weightGrams) == null && v.productType === 'physical') out.push({ id: v.id, sku: v.sku, name: v.name });
      }
    } else if (p.weightGrams == null && p.productType === 'physical') {
      out.push({ id: p.id, sku: p.sku, name: p.name });
    }
  }
  return out;
}

/** Weak ETag for a JSON body. */
export function etagFor(body: unknown): string {
  // Ignore per-request fields so an unchanged catalog keeps its ETag.
  const stable = JSON.stringify(body, (key, value) => (key === 'asOf' || key === 'requestId' || key === 'serviceTime' ? undefined : value));
  return `W/"${createHash('sha256').update(stable).digest('base64url').slice(0, 27)}"`;
}

/** Defined attributes plus any codes used on products without a definition (type text). */
export function attributeList(b: CatalogBundle): CatalogAttributeRaw[] {
  const out = [...b.attributes];
  const known = new Set(out.map((a) => a.code));
  for (const p of b.products) {
    for (const a of p.attributeValues) {
      if (!a.code || known.has(a.code)) continue;
      known.add(a.code);
      out.push({ code: a.code, name: a.code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), type: 'text', unit: null, allowedValues: [], filterable: false });
    }
  }
  return out.sort((a, c) => a.code.localeCompare(c.code));
}
