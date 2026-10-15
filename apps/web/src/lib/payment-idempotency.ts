/** Canonical payload for a receive/pay batch. Same key + different invoices must not replay. */
export function paymentOperationFingerprint(input: {
  paymentDate: string;
  paymentAccountCode: string;
  allocations: { documentId: string; amount: number }[];
}): string {
  const allocations = [...input.allocations]
    .filter((a) => Number(a.amount) > 0)
    .map((a) => ({
      documentId: String(a.documentId),
      amount: Number(a.amount).toFixed(2),
    }))
    .sort((a, b) => a.documentId.localeCompare(b.documentId) || a.amount.localeCompare(b.amount));
  return JSON.stringify({
    paymentDate: String(input.paymentDate),
    paymentAccountCode: String(input.paymentAccountCode),
    allocations,
  });
}

/** True when a completed claim cannot be proven to be the same operation. */
export function paymentFingerprintConflicts(stored: unknown, fingerprint: string): boolean {
  if (!stored || typeof stored !== 'object') return true;
  const rec = stored as { fingerprint?: unknown };
  if (typeof rec.fingerprint !== 'string' || rec.fingerprint.length === 0) return true;
  return rec.fingerprint !== fingerprint;
}
