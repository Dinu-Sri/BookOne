/**
 * Last-used defaults for cashbook (guide §5.4 — smart defaults).
 * Stored in localStorage; never silently force Marketing/Other.
 */

const KEY_CAT = 'bookone.cashbook.lastCat';
const KEY_PAY = 'bookone.cashbook.lastPay';

export function readLastCategory(domain: string, direction: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(`${KEY_CAT}.${domain}.${direction}`);
  } catch {
    return null;
  }
}

export function writeLastCategory(domain: string, direction: string, code: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${KEY_CAT}.${domain}.${direction}`, code);
  } catch {
    /* ignore */
  }
}

export function readLastPayMethod(): 'Cash' | 'Bank' | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(KEY_PAY);
    return v === 'Cash' || v === 'Bank' ? v : null;
  } catch {
    return null;
  }
}

export function writeLastPayMethod(m: 'Cash' | 'Bank') {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_PAY, m);
  } catch {
    /* ignore */
  }
}

/** Display date as "28 Jul 2026" — unambiguous for SL (guide §5.6). */
export function formatDisplayDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Month label e.g. "Jul 2026" from YYYY-MM */
export function formatPeriodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Amount typing with thousands separators (display); returns raw digits for parse. */
export function formatAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  const intPart = parts[0] || '';
  const dec = parts.length > 1 ? parts.slice(1).join('').slice(0, 2) : null;
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec !== null ? `${withCommas}.${dec}` : withCommas;
}

export function parseAmountInput(display: string): number {
  return Number(display.replace(/,/g, ''));
}
