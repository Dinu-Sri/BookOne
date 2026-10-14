/** True when a stored payload is a finished success or failure, not an in-flight claim. */
export function isCompletedIdempotencyResult(existing: unknown): boolean {
  if (!existing || typeof existing !== 'object') return false;
  const rec = existing as { pending?: boolean; ok?: boolean; id?: string; paidCount?: number };
  if (rec.pending === true) return false;
  if (typeof rec.id === 'string' && rec.id.length > 0) return true;
  if (rec.ok === true || rec.ok === false) return true;
  if (typeof rec.paidCount === 'number') return true;
  return false;
}
