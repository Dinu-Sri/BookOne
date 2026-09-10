/** Sell / stock units shown on the product form — labels, not warehouse jargon. */
export const PRODUCT_UNITS = [
  { value: 'each', label: 'Each (one item)', aliases: ['ea', 'each', 'pc', 'pcs', 'piece', 'unit'] },
  { value: 'box', label: 'Box', aliases: ['box', 'bx'] },
  { value: 'pack', label: 'Pack', aliases: ['pack', 'pk'] },
  { value: 'set', label: 'Set', aliases: ['set'] },
  { value: 'pair', label: 'Pair', aliases: ['pair', 'pr'] },
  { value: 'dozen', label: 'Dozen (12)', aliases: ['dozen', 'doz'] },
  { value: 'kg', label: 'Kilogram (kg)', aliases: ['kg', 'kilo', 'kilogram'] },
  { value: 'g', label: 'Gram (g)', aliases: ['g', 'gram', 'grams'] },
  { value: 'l', label: 'Litre (L)', aliases: ['l', 'lt', 'liter', 'litre'] },
  { value: 'ml', label: 'Millilitre (ml)', aliases: ['ml'] },
  { value: 'm', label: 'Metre (m)', aliases: ['m', 'meter', 'metre'] },
  { value: 'cm', label: 'Centimetre (cm)', aliases: ['cm'] },
  { value: 'hour', label: 'Hour', aliases: ['hour', 'hr', 'hrs'] },
  { value: 'day', label: 'Day', aliases: ['day', 'days'] },
] as const;

export type ProductUnitValue = (typeof PRODUCT_UNITS)[number]['value'];

export function normalizeProductUnit(raw?: string | null): string {
  const key = (raw ?? '').trim().toLowerCase();
  if (!key) return 'each';
  const match = PRODUCT_UNITS.find((u) => u.value === key || (u.aliases as readonly string[]).includes(key));
  return match?.value ?? key.slice(0, 40);
}

export function productUnitLabel(raw?: string | null): string {
  const value = normalizeProductUnit(raw);
  return PRODUCT_UNITS.find((u) => u.value === value)?.label ?? (raw?.trim() || 'Each (one item)');
}

export function productUnitOptions(current?: string | null): { value: string; label: string }[] {
  const options = PRODUCT_UNITS.map((u) => ({ value: u.value, label: u.label }));
  const currentValue = current?.trim();
  if (!currentValue) return options;
  const normalized = normalizeProductUnit(currentValue);
  if (!options.some((o) => o.value === normalized)) {
    options.push({ value: currentValue, label: currentValue });
  }
  return options;
}
