/**
 * Server and tests share this close rule. Matching existing records never
 * manufactures a zero difference.
 */
export type FinishCase = { caseType: string; state: string };

const OPEN_STATES = new Set(['suggested', 'needs_review', 'deferred', 'reopened']);

export type FinishEligibility = {
  ok: boolean;
  difference: number;
  verified: boolean;
  blockers: string[];
};

export type ComparisonDifference = {
  verified: boolean;
  difference: number;
};

/** Same formula as compare: bankClose − bookClose + outstandingNet. */
export function comparisonDifference(input: {
  bankClose: number | null;
  bookClose: number | null;
  outstandingNet: number;
}): ComparisonDifference {
  if (input.bankClose == null || input.bookClose == null) {
    return { verified: false, difference: 0 };
  }
  return {
    verified: true,
    difference: Math.round((input.bankClose - input.bookClose + input.outstandingNet) * 100) / 100,
  };
}

export function finishEligibility(input: {
  openCases: FinishCase[];
  bankClose: number | null;
  bookClose: number | null;
  outstandingNet: number;
  differenceAmount?: number;
  tolerance?: number;
}): FinishEligibility {
  const tol = input.tolerance ?? 0.01;
  const blockers: string[] = [];
  const open = input.openCases.filter((c) => OPEN_STATES.has(c.state));
  const blocking = open.filter((c) => c.caseType !== 'outstanding_book');
  if (blocking.length > 0) {
    const bankOnly = blocking.filter((c) => c.caseType === 'create_entry' || c.caseType === 'group_match').length;
    const matches = blocking.filter((c) => c.caseType === 'match_1_1').length;
    const transfers = blocking.filter((c) => c.caseType === 'transfer').length;
    const other = blocking.length - bankOnly - matches - transfers;
    if (matches > 0) blockers.push(`${matches} suggested match${matches === 1 ? '' : 'es'} to confirm`);
    if (bankOnly > 0) blockers.push(`${bankOnly} bank line${bankOnly === 1 ? '' : 's'} to review`);
    if (transfers > 0) blockers.push(`${transfers} possible transfer${transfers === 1 ? '' : 's'}`);
    if (other > 0) blockers.push(`${other} item${other === 1 ? '' : 's'} still need a decision`);
  }
  const openWait = open.filter((c) => c.caseType === 'outstanding_book');
  if (openWait.length > 0) {
    blockers.push(
      `${openWait.length} BookOne item${openWait.length === 1 ? '' : 's'} still open — mark waiting to clear, or match them`,
    );
  }

  const cmp = comparisonDifference({
    bankClose: input.bankClose,
    bookClose: input.bookClose,
    outstandingNet: input.outstandingNet,
  });
  if (!cmp.verified) {
    blockers.push('No current comparison');
  }
  const diff = cmp.verified ? cmp.difference : Math.round((input.differenceAmount ?? 0) * 100) / 100;
  if (cmp.verified && Math.abs(diff) > tol) {
    blockers.push(`Difference LKR ${diff.toFixed(2)} is unexplained`);
  }

  return { ok: blockers.length === 0, difference: diff, verified: cmp.verified, blockers };
}
