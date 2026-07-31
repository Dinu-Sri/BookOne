/**
 * Browser-safe helpers for unknown money-label resolution.
 * Must not import node:crypto / xlsx (client components use this).
 */

export type UnknownLabelIssue = {
  label: string;
  count: number;
  sampleRows: number[];
  sampleDescriptions: string[];
};

/** Minimal line shape — compatible with StudioLine. */
export type UnknownLabelLine = {
  validationStatus: string;
  unknownLabel?: string;
  rowNumber: number;
  description: string;
};

/** Unique unknown money labels for the issue-by-issue resolve wizard. */
export function collectUnknownMoneyLabels(lines: UnknownLabelLine[]): UnknownLabelIssue[] {
  const map = new Map<string, UnknownLabelIssue>();
  for (const l of lines) {
    if (l.validationStatus !== 'error' || !l.unknownLabel) continue;
    const key = l.unknownLabel;
    const cur = map.get(key);
    if (cur) {
      cur.count += 1;
      if (cur.sampleRows.length < 4) cur.sampleRows.push(l.rowNumber);
      if (cur.sampleDescriptions.length < 3 && l.description) {
        cur.sampleDescriptions.push(l.description.slice(0, 80));
      }
    } else {
      map.set(key, {
        label: key,
        count: 1,
        sampleRows: [l.rowNumber],
        sampleDescriptions: l.description ? [l.description.slice(0, 80)] : [],
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
