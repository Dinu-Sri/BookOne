import { createHash } from 'node:crypto';

export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Idempotency key within tenant + bank account.
 * Same bank line re-uploaded must collide.
 */
export function lineFingerprint(input: {
  tenantId: string;
  bankAccountId: string;
  date: string;
  amountSigned: number;
  description: string;
  externalRef?: string;
}): string {
  const payload = [
    input.tenantId,
    input.bankAccountId,
    input.date,
    input.amountSigned.toFixed(2),
    normalizeDescription(input.description),
    input.externalRef?.trim() ?? '',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function fileSha256(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
