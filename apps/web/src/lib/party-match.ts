export const AMBIGUOUS_PARTY_MESSAGE =
  'More than one party uses this name. Pick the party from the list so the document posts to the right one.';

/**
 * Resolve a typed/picked party name (QA-1126-04). A legal-name match wins; else a
 * single display-name match; several display-name matches are refused, never guessed.
 */
export function pickPartyByName<T extends { name: string; displayName: string | null }>(
  matches: T[],
  name: string,
): T | undefined {
  const key = name.trim().toLowerCase();
  const legal = matches.find((m) => m.name.trim().toLowerCase() === key);
  if (legal) return legal;
  const display = matches.filter((m) => (m.displayName ?? '').trim().toLowerCase() === key);
  if (display.length > 1) throw new Error(AMBIGUOUS_PARTY_MESSAGE);
  return display[0];
}
