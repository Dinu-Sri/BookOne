import 'server-only';

import { coreguardErrorInfo } from '@/lib/coreguard-error-map';
import { logOps } from '@/lib/ops-log';

export { COREGUARD_GENERIC_MESSAGE, COREGUARD_USER_MESSAGES, coreguardErrorInfo } from '@/lib/coreguard-error-map';

/**
 * Message to show for an error caught in a server action (guide §4.4).
 * CoreGuard guard errors become the plain user message and the original goes to /ops/logs; other errors keep
 * their existing message (or the fallback when they carry none).
 */
export function userMessageForError(error: unknown, fallback: string): string {
  const info = coreguardErrorInfo(error);
  if (info) {
    void logOps({ kind: 'error', status: `COREGUARD ${info.code}`, message: info.original });
    return info.userMessage;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
