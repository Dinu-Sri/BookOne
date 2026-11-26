/**
 * QA-1126-08: every commit result that is not a posted bill must give the user a
 * reason. Returns null only for `posted`.
 */
export function commitOutcomeMessage(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== 'object') return 'The purchase bill was not posted. Try again.';
  const r = receipt as { ok?: boolean; error?: string; status?: string; documentNumber?: string };
  if (r.ok === false) return r.error || 'The purchase bill was not posted.';
  switch (r.status) {
    case 'posted':
      return null;
    case 'failed':
      return `The purchase bill was not posted: ${r.error || 'BookOne refused it.'} Fix the cause, preview and approve again, then commit.`;
    case 'unknown_outcome':
      return 'BookOne could not confirm whether the bill posted. Check Purchases before committing again.';
    case 'posting':
      return 'The bill is still posting. Refresh in a moment.';
    default:
      return 'The purchase bill was not posted. Try again.';
  }
}
