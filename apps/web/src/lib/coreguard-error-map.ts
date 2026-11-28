/**
 * CoreGuard error contract (guide §4.4). Database guards raise SQLSTATE 23514 with a message starting
 * "COREGUARD Gxx:". Users see the plain message below, never the SQL text. Pure module (no server-only),
 * so it can be unit-tested; `coreguard-errors.ts` adds logging.
 */

export const COREGUARD_GENERIC_MESSAGE =
  'Nothing was saved because the books would have become inconsistent. The error has been logged.';

export const COREGUARD_USER_MESSAGES: Readonly<Record<string, string>> = {
  G01: "This entry doesn't balance, so nothing was saved.",
  G02: 'An amount, date or side in this entry is not valid, so nothing was saved.',
  G03: "This entry refers to an account or contact that can't be used here.",
  G04: "Posted entries can't be changed. Post a reversal instead.",
  G05: 'This month is closed. Reopen it (with a reason) or use an open date.',
  G06: 'An amount, date or side in this entry is not valid, so nothing was saved.',
  G07: 'This entry could not be saved completely, so nothing was saved. Please try again.',
  G09: 'This entry could not be saved completely, so nothing was saved. Please try again.',
  G10: 'Choose the customer, supplier or staff member for this entry.',
  G11: 'This payment is from a different party than the invoice. Record it as a third-party payment with a reason and reference.',
};

/** Unique indexes owned by the CoreGuard migrations (061+). A violation means the books would be inconsistent. */
const COREGUARD_INDEX = /\b(cg_[a-z0-9_]+)\b/;

export type CoreGuardErrorInfo = {
  /** Guard code ("G01"…), "INDEX" for a CoreGuard unique index, or "COREGUARD" when the code is unknown. */
  code: string;
  userMessage: string;
  /** The original database message, for /ops/logs only. */
  original: string;
};

function messageChain(error: unknown): string[] {
  const out: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current instanceof Error) {
      out.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
    } else if (typeof current === 'object' && current && 'message' in current) {
      out.push(String((current as { message: unknown }).message));
      current = (current as { cause?: unknown }).cause;
    } else {
      out.push(String(current));
      break;
    }
  }
  return out;
}

/** Recognise a CoreGuard guard or index error anywhere in the error chain; null for any other error. */
export function coreguardErrorInfo(error: unknown): CoreGuardErrorInfo | null {
  for (const message of messageChain(error)) {
    const guard = /COREGUARD\s+(G\d{2})\s*:/.exec(message);
    if (guard) {
      const code = guard[1]!;
      return { code, userMessage: COREGUARD_USER_MESSAGES[code] ?? COREGUARD_GENERIC_MESSAGE, original: message };
    }
    if (/\bCOREGUARD\b/.test(message)) {
      return { code: 'COREGUARD', userMessage: COREGUARD_GENERIC_MESSAGE, original: message };
    }
    if (/duplicate key value violates unique constraint/i.test(message) && COREGUARD_INDEX.test(message)) {
      return { code: 'INDEX', userMessage: COREGUARD_GENERIC_MESSAGE, original: message };
    }
  }
  return null;
}
