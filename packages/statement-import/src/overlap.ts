/**
 * Multi-statement / multi-file overlap helpers (studio hardening).
 * Pure date/fingerprint logic — no DB.
 */

export type DateRange = { from: string | null; to: string | null };

/** Inclusive ISO date (YYYY-MM-DD) ranges overlap? */
export function dateRangesOverlap(a: DateRange, b: DateRange): boolean {
  if (!a.from || !a.to || !b.from || !b.to) return false;
  // [a.from, a.to] overlaps [b.from, b.to]
  return a.from <= b.to && b.from <= a.to;
}

/** Days between end of earlier range and start of later (positive = gap). */
export function gapDaysBetween(a: DateRange, b: DateRange): number | null {
  if (!a.to || !b.from) return null;
  // Assume a is the earlier-ending import when a.to <= b.from
  if (a.to < b.from) {
    const da = new Date(`${a.to}T12:00:00`).getTime();
    const db = new Date(`${b.from}T12:00:00`).getTime();
    if (Number.isNaN(da) || Number.isNaN(db)) return null;
    return Math.round((db - da) / (24 * 60 * 60 * 1000)) - 1;
  }
  if (b.to && b.to < a.from) {
    const da = new Date(`${b.to}T12:00:00`).getTime();
    const db = new Date(`${a.from}T12:00:00`).getTime();
    if (Number.isNaN(da) || Number.isNaN(db)) return null;
    return Math.round((db - da) / (24 * 60 * 60 * 1000)) - 1;
  }
  return 0; // overlap or adjacent
}

export type OverlapReport = {
  overlappingFingerprints: string[];
  periodOverlaps: {
    otherPeriodFrom: string | null;
    otherPeriodTo: string | null;
    otherFileName: string;
  }[];
  gapAfterPreviousDays: number | null;
  warnings: string[];
};

/**
 * Build human warnings from fingerprint hits + prior import date ranges.
 */
export function buildOverlapReport(input: {
  newFingerprints: string[];
  knownFingerprints: Set<string>;
  newRange: DateRange;
  priorImports: {
    fileName: string;
    periodFrom: string | null;
    periodTo: string | null;
  }[];
}): OverlapReport {
  const overlappingFingerprints = input.newFingerprints.filter((fp) =>
    input.knownFingerprints.has(fp),
  );

  const periodOverlaps = input.priorImports.filter((p) =>
    dateRangesOverlap(input.newRange, { from: p.periodFrom, to: p.periodTo }),
  );

  // Gap vs most recent prior by periodTo
  const sorted = [...input.priorImports]
    .filter((p) => p.periodTo)
    .sort((a, b) => (a.periodTo! < b.periodTo! ? 1 : -1));
  const latest = sorted[0];
  let gapAfterPreviousDays: number | null = null;
  if (latest && input.newRange.from) {
    const g = gapDaysBetween(
      { from: latest.periodFrom, to: latest.periodTo },
      input.newRange,
    );
    if (g != null && g > 1) gapAfterPreviousDays = g;
  }

  const warnings: string[] = [];
  if (overlappingFingerprints.length > 0) {
    warnings.push(
      `${overlappingFingerprints.length} line(s) look already imported for this bank (same date + amount + description). They will be marked duplicate.`,
    );
  }
  for (const p of periodOverlaps.slice(0, 3)) {
    warnings.push(
      `Date range overlaps previous file “${p.fileName}” (${p.periodFrom ?? '?'} → ${p.periodTo ?? '?'}). Check you are not re-importing the same month.`,
    );
  }
  if (gapAfterPreviousDays != null && gapAfterPreviousDays > 7) {
    warnings.push(
      `About ${gapAfterPreviousDays} day(s) gap after your last import ending ${latest?.periodTo}. Missing a month?`,
    );
  }

  return {
    overlappingFingerprints,
    periodOverlaps: periodOverlaps.map((p) => ({
      otherPeriodFrom: p.periodFrom,
      otherPeriodTo: p.periodTo,
      otherFileName: p.fileName,
    })),
    gapAfterPreviousDays,
    warnings,
  };
}
