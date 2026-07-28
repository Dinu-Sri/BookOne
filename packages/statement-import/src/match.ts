import type { BookCandidate, CanonicalStatementLine, MatchResult, ProposedAction } from './types';
import { normalizeDescription } from './fingerprint';

/** Exact amount + same day is enough for auto-propose when unique winner */
const AUTO_LINK = 0.9;
const REVIEW_MIN = 0.7;

function tokens(s: string): Set<string> {
  return new Set(
    normalizeDescription(s)
      .split(' ')
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function dayDiff(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`).getTime();
  const db = new Date(`${b}T12:00:00`).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 99;
  return Math.abs(da - db) / (24 * 60 * 60 * 1000);
}

/**
 * Score bank line against book candidates.
 * Hard filters: amount within 0.01, date within maxDayWindow.
 */
export function matchLine(
  line: CanonicalStatementLine,
  books: BookCandidate[],
  opts?: { maxDayWindow?: number; usedBookIds?: Set<string> },
): MatchResult {
  const maxDay = opts?.maxDayWindow ?? 2;
  const used = opts?.usedBookIds ?? new Set<string>();
  const absAmt = Math.abs(line.amountSigned);

  const scored: { id: string; score: number }[] = [];

  for (const tx of books) {
    if (used.has(tx.id)) continue;
    if (Math.abs(Math.abs(tx.amountSigned) - absAmt) > 0.01) continue;
    // Direction agreement when both known
    if (
      line.direction !== 'unknown' &&
      ((line.amountSigned > 0 && tx.amountSigned < 0) ||
        (line.amountSigned < 0 && tx.amountSigned > 0))
    ) {
      continue;
    }
    const dd = dayDiff(line.date, tx.date);
    if (dd > maxDay) continue;

    let score = 0.58; // amount match base (hard-gated)
    if (dd === 0) score += 0.32; // → 0.90 floor on exact date+amount
    else if (dd <= 1) score += 0.18;
    else score += 0.08;

    const sim = jaccard(line.description, tx.description);
    score += sim * 0.12;

    if (line.externalRef && tx.description.toLowerCase().includes(line.externalRef.toLowerCase())) {
      score += 0.1;
    }

    score = Math.min(1, score);
    scored.push({ id: tx.id, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];

  let proposedAction: ProposedAction = 'create';
  let matchMethod: MatchResult['matchMethod'] = 'none';
  let matchedTransactionId: string | null = null;
  let matchScore = 0;

  if (best && best.score >= AUTO_LINK && (!second || best.score - second.score >= 0.05)) {
    proposedAction = 'link';
    matchMethod = best.score >= 0.97 ? 'exact' : 'fuzzy';
    matchedTransactionId = best.id;
    matchScore = best.score;
  } else if (best && best.score >= REVIEW_MIN) {
    proposedAction = 'review';
    matchMethod = 'fuzzy';
    matchedTransactionId = null;
    matchScore = best.score;
  } else {
    proposedAction = 'create';
    matchScore = best?.score ?? 0;
  }

  // Low date confidence always review if linking
  const confidence = Math.min(
    line.dateConfidence,
    proposedAction === 'link' ? matchScore : proposedAction === 'create' ? 0.55 : matchScore,
  );
  if (line.dateConfidence < 0.75 && proposedAction === 'link') {
    proposedAction = 'review';
  }

  return {
    line,
    proposedAction,
    matchScore,
    matchMethod,
    matchedTransactionId,
    candidates: scored.slice(0, 5),
    confidence,
  };
}

export function matchAll(
  lines: CanonicalStatementLine[],
  books: BookCandidate[],
  opts?: { maxDayWindow?: number },
): MatchResult[] {
  const used = new Set<string>();
  const results: MatchResult[] = [];
  // Greedy: highest amount+date first for better unique assignment
  const ordered = [...lines].sort(
    (a, b) => Math.abs(b.amountSigned) - Math.abs(a.amountSigned) || a.date.localeCompare(b.date),
  );
  for (const line of ordered) {
    const r = matchLine(line, books, { ...opts, usedBookIds: used });
    if (r.matchedTransactionId) used.add(r.matchedTransactionId);
    results.push(r);
  }
  // Restore original order
  const byRow = new Map(results.map((r) => [r.line.rowNumber, r]));
  return lines.map((l) => byRow.get(l.rowNumber)!);
}
