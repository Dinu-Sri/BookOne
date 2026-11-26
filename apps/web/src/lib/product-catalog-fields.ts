/**
 * Commerce WP1: parse the product form's "Online store" fields into
 * inventory_products column values. Pure, so it can be unit tested.
 */

export type CatalogFieldValues = {
  shortName: string | null;
  productBrandId: string | null;
  parentProductId: string | null;
  variantOptions: Array<{ name: string; value: string }>;
  productOptions: Array<{ name: string; values: string[] }>;
  swatchHex: string | null;
  variantSortOrder: number;
  isDefaultVariant: '0' | '1';
  tags: string[];
  extraBarcodes: string[];
  attributeValues: Array<{ code: string; value: string }>;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  fragile: '0' | '1';
  minOrderQty: string | null;
  maxOrderQty: string | null;
  orderQtyStep: string | null;
  allowBackorder: '0' | '1';
  /** True when the product is a parent listing (variants hold stock). */
  isParentListing: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

function list(raw: string, max = 50, maxLen = 80): string[] {
  return [...new Set(raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, max).map((s) => s.slice(0, maxLen));
}

function intOrNull(raw: string, label: string, max = 10_000_000): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > max || !Number.isInteger(n)) throw new Error(`${label} must be a whole number of 0 or more.`);
  return n;
}

function qtyOrNull(raw: string, label: string): string | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be more than 0.`);
  return n.toFixed(4);
}

/** "Colour: Chinese White, Lemon Yellow; Size: 8ml, 21ml" */
export function parseProductOptions(raw: string): Array<{ name: string; values: string[] }> {
  if (!raw.trim()) return [];
  return raw
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf(':');
      if (i < 1) throw new Error(`Write each option as "Name: value, value" (got "${part}").`);
      return { name: part.slice(0, i).trim().slice(0, 60), values: list(part.slice(i + 1), 100, 60) };
    })
    .filter((o) => o.name && o.values.length)
    .slice(0, 3);
}

/** "Colour=Lemon Yellow; Size=8ml" */
export function parseVariantOptions(raw: string): Array<{ name: string; value: string }> {
  if (!raw.trim()) return [];
  return raw
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf('=');
      if (i < 1) throw new Error(`Write each variant option as "Name=value" (got "${part}").`);
      return { name: part.slice(0, i).trim().slice(0, 60), value: part.slice(i + 1).trim().slice(0, 60) };
    })
    .filter((o) => o.name && o.value)
    .slice(0, 3);
}

/** "volume_ml=8" per line */
export function parseAttributeValues(raw: string): Array<{ code: string; value: string }> {
  if (!raw.trim()) return [];
  return raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf('=');
      if (i < 1) throw new Error(`Write each attribute as "code=value" (got "${line}").`);
      const code = line
        .slice(0, i)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .slice(0, 60);
      return { code, value: line.slice(i + 1).trim().slice(0, 200) };
    })
    .filter((a) => a.code && a.value)
    .slice(0, 50);
}

export function formatProductOptions(v: unknown): string {
  return Array.isArray(v) ? (v as Array<{ name: string; values: string[] }>).map((o) => `${o.name}: ${o.values.join(', ')}`).join('; ') : '';
}

export function formatVariantOptions(v: unknown): string {
  return Array.isArray(v) ? (v as Array<{ name: string; value: string }>).map((o) => `${o.name}=${o.value}`).join('; ') : '';
}

export function formatAttributeValues(v: unknown): string {
  return Array.isArray(v) ? (v as Array<{ code: string; value: string }>).map((o) => `${o.code}=${o.value}`).join('\n') : '';
}

/** Returns null when the form did not include the Online store section (other callers). */
export function catalogValuesFromForm(fd: FormData, selfId?: string): CatalogFieldValues | null {
  if (str(fd.get('catalogFields')) !== '1') return null;
  const isParentListing = fd.get('isParentListing') === 'on' || fd.get('isParentListing') === '1';
  const parentRaw = str(fd.get('parentProductId'));
  const parentProductId = !isParentListing && UUID.test(parentRaw) ? parentRaw : null;
  if (parentProductId && selfId && parentProductId === selfId) throw new Error('A product cannot be a variant of itself.');
  const swatch = str(fd.get('swatchHex'));
  if (swatch && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(swatch)) throw new Error('Swatch colour must look like #F7F5EE.');
  const brandRaw = str(fd.get('productBrandId'));
  const variantOptions = parentProductId ? parseVariantOptions(str(fd.get('variantOptions'))) : [];
  if (parentProductId && !variantOptions.length) throw new Error('A variant needs its option values, e.g. "Colour=Lemon Yellow".');
  const productOptions = isParentListing ? parseProductOptions(str(fd.get('productOptions'))) : [];
  if (isParentListing && !productOptions.length) throw new Error('A listing with variants needs its options, e.g. "Colour: Chinese White, Lemon Yellow".');
  return {
    shortName: str(fd.get('shortName')).slice(0, 120) || null,
    productBrandId: UUID.test(brandRaw) ? brandRaw : null,
    parentProductId,
    variantOptions,
    productOptions,
    swatchHex: parentProductId && swatch ? swatch.toUpperCase() : null,
    variantSortOrder: intOrNull(str(fd.get('variantSortOrder')), 'Variant order', 100000) ?? 0,
    isDefaultVariant: parentProductId && (fd.get('isDefaultVariant') === 'on' || fd.get('isDefaultVariant') === '1') ? '1' : '0',
    tags: list(str(fd.get('tags'))),
    extraBarcodes: list(str(fd.get('extraBarcodes')), 20, 80),
    attributeValues: parseAttributeValues(str(fd.get('attributeValues'))),
    weightGrams: intOrNull(str(fd.get('weightGrams')), 'Weight'),
    lengthMm: intOrNull(str(fd.get('lengthMm')), 'Length'),
    widthMm: intOrNull(str(fd.get('widthMm')), 'Width'),
    heightMm: intOrNull(str(fd.get('heightMm')), 'Height'),
    fragile: fd.get('fragile') === 'on' || fd.get('fragile') === '1' ? '1' : '0',
    minOrderQty: qtyOrNull(str(fd.get('minOrderQty')), 'Minimum order quantity'),
    maxOrderQty: qtyOrNull(str(fd.get('maxOrderQty')), 'Maximum order quantity'),
    orderQtyStep: qtyOrNull(str(fd.get('orderQtyStep')), 'Order quantity step'),
    allowBackorder: fd.get('allowBackorder') === 'on' || fd.get('allowBackorder') === '1' ? '1' : '0',
    isParentListing,
  };
}

/** Column values to write (drops the form-only flag; a parent listing never sells or holds stock itself). */
export function catalogColumns(v: CatalogFieldValues) {
  const { isParentListing, ...cols } = v;
  return isParentListing ? { ...cols, sellable: '0', purchasable: '0' } : cols;
}
