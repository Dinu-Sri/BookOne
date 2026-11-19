import type { StudioMapping } from './studio-transform-types';

/** High-confidence Date + Description + money columns can skip one-by-one mapping. */
export function mappingIsConfident(mapping: StudioMapping | null | undefined): boolean {
  if (!mapping) return false;
  if (mapping.dateCol < 0 || mapping.descriptionCol < 0) return false;
  const ar = mapping.amountRules;
  if (ar.mode === 'debit_credit') {
    return ar.moneyOutCol != null && ar.moneyOutCol >= 0 && ar.moneyInCol != null && ar.moneyInCol >= 0;
  }
  if (ar.mode === 'amount_with_type') {
    return ar.amountCol != null && ar.amountCol >= 0 && ar.typeCol != null && ar.typeCol >= 0;
  }
  if (ar.mode === 'signed_amount' || ar.mode === 'embedded_indicator') {
    return ar.amountCol != null && ar.amountCol >= 0;
  }
  return false;
}
