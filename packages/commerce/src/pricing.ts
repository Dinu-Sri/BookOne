/**
 * Commerce WP2 — channel pricing. Pure: the store supplies price lists and
 * entries; this decides the price a channel shows and accepts.
 *
 * - A channel sells at its assigned price list; with none, at the BookOne
 *   sell price (priceListId "default").
 * - An entry may override the price, add a compare-at ("was") price, a
 *   scheduled sale price and quantity tiers. Empty fields fall back.
 */

export type PriceTier = { minQty: string; price: string };

export type PriceEntry = {
  productId: string;
  price: string | null;
  compareAtPrice: string | null;
  salePrice: string | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  tiers: PriceTier[];
  updatedAt: string;
};

export type PriceListRaw = {
  id: string;
  name: string;
  currency: string;
  customerGroup: string | null;
  entries: Map<string, PriceEntry>;
  updatedAt: string;
};

export type ChannelPrice = {
  currency: string;
  priceListId: string;
  /** Regular price on this list. */
  price: string;
  /** "Was" price to show struck through; only when higher than the regular price. */
  compareAtPrice: string | null;
  sale: { price: string; startsAt: string | null; endsAt: string | null; active: boolean } | null;
  tiers: PriceTier[];
  /** What a single unit costs right now (sale when active, else the regular price). */
  effectivePrice: string;
  revision: number;
  updatedAt: string;
};

function money(v: string | number | null | undefined): string {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function saleActive(entry: Pick<PriceEntry, 'salePrice' | 'saleStartsAt' | 'saleEndsAt'>, now: number): boolean {
  if (entry.salePrice === null || entry.salePrice === '') return false;
  if (entry.saleStartsAt && ms(entry.saleStartsAt) > now) return false;
  if (entry.saleEndsAt && ms(entry.saleEndsAt) <= now) return false;
  return true;
}

/** Price a product shows on a channel. `list` null means the BookOne sell price. */
export function channelPrice(
  product: { id: string; sellPrice: string; updatedAt: string },
  list: PriceListRaw | null,
  currency: string,
  now = Date.now(),
): ChannelPrice {
  const entry = list?.entries.get(product.id);
  const price = money(entry?.price ?? product.sellPrice);
  const compare = entry?.compareAtPrice && Number(entry.compareAtPrice) > Number(price) ? money(entry.compareAtPrice) : null;
  const active = entry ? saleActive(entry, now) : false;
  const sale =
    entry && entry.salePrice !== null && entry.salePrice !== ''
      ? { price: money(entry.salePrice), startsAt: entry.saleStartsAt, endsAt: entry.saleEndsAt, active }
      : null;
  const updatedAt = entry && ms(entry.updatedAt) > ms(product.updatedAt) ? entry.updatedAt : product.updatedAt;
  return {
    currency: list?.currency ?? currency,
    priceListId: list?.id ?? 'default',
    price,
    compareAtPrice: compare,
    sale,
    tiers: (entry?.tiers ?? [])
      .map((t) => ({ minQty: String(Number(t.minQty)), price: money(t.price) }))
      .filter((t) => Number(t.minQty) > 1)
      .sort((a, b) => Number(a.minQty) - Number(b.minQty)),
    effectivePrice: active && sale ? sale.price : price,
    revision: ms(updatedAt),
    updatedAt,
  };
}

/**
 * Unit price for a quantity: the lower of the effective price and the best
 * tier the quantity reaches.
 */
export function unitPriceFor(p: ChannelPrice, quantity: number): string {
  let unit = Number(p.effectivePrice);
  for (const t of p.tiers) {
    if (quantity >= Number(t.minQty)) unit = Math.min(unit, Number(t.price));
  }
  return money(unit);
}

/** The list a request prices with: a customer-group list when asked and present, else the channel's. */
export function pickPriceList(
  lists: PriceListRaw[],
  channelListId: string | null,
  customerGroup?: string | null,
): PriceListRaw | null {
  const group = customerGroup?.trim().toLowerCase();
  if (group) {
    const hit = lists.find((l) => (l.customerGroup ?? '').toLowerCase() === group);
    if (hit) return hit;
  }
  return channelListId ? (lists.find((l) => l.id === channelListId) ?? null) : null;
}

/** "6=1050; 12=990" → tiers. */
export function parseTiers(raw: string): PriceTier[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[;,\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [q, v] = p.split('=').map((x) => x?.trim() ?? '');
      const minQty = Number(q);
      const price = Number(v);
      if (!Number.isFinite(minQty) || minQty < 2 || !Number.isFinite(price) || price < 0) {
        throw new Error(`Write each tier as "quantity=price" with quantity 2 or more (got "${p}").`);
      }
      return { minQty: String(minQty), price: price.toFixed(2) };
    })
    .slice(0, 10);
}

export function formatTiers(tiers: PriceTier[]): string {
  return tiers.map((t) => `${Number(t.minQty)}=${t.price}`).join('; ');
}
