/**
 * Universal BookOne period range.
 * Encoded in URL ?period=… and cookie bookone_period for cross-module continuity.
 *
 * Tokens:
 *   all | last_7d | last_30d | this_month | last_month | this_fy | last_fy
 *   YYYY-MM (calendar month)
 *   YYYY-MM-DD_YYYY-MM-DD (custom inclusive range)
 */

export type PeriodToken =
  | 'all'
  | 'last_7d'
  | 'last_30d'
  | 'this_month'
  | 'last_month'
  | 'this_fy'
  | 'last_fy'
  | string; // month or custom

export type PeriodBounds = {
  /** URL/cookie token */
  token: string;
  /** Inclusive ISO dates; both null = all time */
  from: string | null;
  to: string | null;
  /** Short label for trigger */
  label: string;
  /** Longer subtitle for menu */
  hint: string;
};

const COOKIE = 'bookone_period';

/** SL / BookOne default FY starts April (month index 1-based = 4). */
export const DEFAULT_FY_START_MONTH = 4;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfMonth(y: number, m0: number): Date {
  return new Date(y, m0, 1);
}

function endOfMonth(y: number, m0: number): Date {
  return new Date(y, m0 + 1, 0);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Financial year containing `now` with start month (1–12). */
export function fyBounds(
  now: Date,
  fyStartMonth = DEFAULT_FY_START_MONTH,
): { from: Date; to: Date; startYear: number } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYear = m >= fyStartMonth ? y : y - 1;
  const from = new Date(startYear, fyStartMonth - 1, 1);
  const to = new Date(startYear + 1, fyStartMonth - 1, 0); // last day before next FY
  return { from, to, startYear };
}

export function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00`).getTime());
}

export function isValidMonth(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}

export function isCustomToken(token: string): boolean {
  return /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(token);
}

export function encodeCustomRange(from: string, to: string): string {
  return `${from}_${to}`;
}

export function parseCustomToken(token: string): { from: string; to: string } | null {
  if (!isCustomToken(token)) return null;
  const [from, to] = token.split('_');
  if (!from || !to || !isValidIsoDate(from) || !isValidIsoDate(to)) return null;
  return { from, to };
}

/**
 * Normalize URL/cookie period to a token we understand.
 * Unknown → this_month (safer than all for dashboards).
 */
export function normalizePeriodToken(raw?: string | null): string {
  if (!raw || raw === 'all') return 'all';
  if (
    raw === 'last_7d' ||
    raw === 'last_30d' ||
    raw === 'this_month' ||
    raw === 'last_month' ||
    raw === 'this_fy' ||
    raw === 'last_fy'
  ) {
    return raw;
  }
  if (isValidMonth(raw)) return raw;
  if (isCustomToken(raw)) return raw;
  return 'this_month';
}

export function resolvePeriodBounds(
  raw?: string | null,
  opts?: { now?: Date; fyStartMonth?: number },
): PeriodBounds {
  const now = opts?.now ?? new Date();
  const fyStart = opts?.fyStartMonth ?? DEFAULT_FY_START_MONTH;
  const token = normalizePeriodToken(raw);

  if (token === 'all') {
    return { token: 'all', from: null, to: null, label: 'All time', hint: 'No date filter' };
  }

  if (token === 'last_7d') {
    const to = now;
    const from = addDays(now, -6);
    return {
      token,
      from: isoDate(from),
      to: isoDate(to),
      label: 'Last 7 days',
      hint: 'Rolling week',
    };
  }

  if (token === 'last_30d') {
    const to = now;
    const from = addDays(now, -29);
    return {
      token,
      from: isoDate(from),
      to: isoDate(to),
      label: 'Last 30 days',
      hint: 'Rolling month',
    };
  }

  if (token === 'this_month') {
    const from = startOfMonth(now.getFullYear(), now.getMonth());
    const to = endOfMonth(now.getFullYear(), now.getMonth());
    return {
      token,
      from: isoDate(from),
      to: isoDate(to),
      label: from.toLocaleString('en-GB', { month: 'short', year: 'numeric' }),
      hint: 'This month',
    };
  }

  if (token === 'last_month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const from = startOfMonth(d.getFullYear(), d.getMonth());
    const to = endOfMonth(d.getFullYear(), d.getMonth());
    return {
      token,
      from: isoDate(from),
      to: isoDate(to),
      label: from.toLocaleString('en-GB', { month: 'short', year: 'numeric' }),
      hint: 'Last month',
    };
  }

  if (token === 'this_fy') {
    const { from, to, startYear } = fyBounds(now, fyStart);
    return {
      token,
      from: isoDate(from),
      to: isoDate(to),
      label: `FY ${startYear}/${String(startYear + 1).slice(2)}`,
      hint: 'This financial year',
    };
  }

  if (token === 'last_fy') {
    const cur = fyBounds(now, fyStart);
    const startYear = cur.startYear - 1;
    const from = new Date(startYear, fyStart - 1, 1);
    const to = new Date(startYear + 1, fyStart - 1, 0);
    return {
      token,
      from: isoDate(from),
      to: isoDate(to),
      label: `FY ${startYear}/${String(startYear + 1).slice(2)}`,
      hint: 'Last financial year',
    };
  }

  if (isValidMonth(token)) {
    const [ys, ms] = token.split('-').map(Number);
    const from = startOfMonth(ys!, ms! - 1);
    const to = endOfMonth(ys!, ms! - 1);
    return {
      token,
      from: isoDate(from),
      to: isoDate(to),
      label: from.toLocaleString('en-GB', { month: 'short', year: 'numeric' }),
      hint: 'Calendar month',
    };
  }

  const custom = parseCustomToken(token);
  if (custom) {
    const a = custom.from <= custom.to ? custom.from : custom.to;
    const b = custom.from <= custom.to ? custom.to : custom.from;
    const label =
      a === b
        ? a
        : `${a.slice(8)}/${a.slice(5, 7)} – ${b.slice(8)}/${b.slice(5, 7)}`;
    return {
      token: encodeCustomRange(a, b),
      from: a,
      to: b,
      label,
      hint: 'Custom range',
    };
  }

  // fallback this month
  return resolvePeriodBounds('this_month', opts);
}

/** Preset rows for the period popover (design order + FY). */
export const PERIOD_PRESETS: {
  token: string;
  title: string;
  hint: string;
}[] = [
  { token: 'all', title: 'All time', hint: 'No date filter' },
  { token: 'last_7d', title: 'Last 7 days', hint: 'Rolling week' },
  { token: 'last_30d', title: 'Last 30 days', hint: 'Rolling month' },
  { token: 'this_month', title: 'This month', hint: 'Calendar month' },
  { token: 'last_month', title: 'Last month', hint: 'Previous calendar month' },
  { token: 'this_fy', title: 'This financial year', hint: 'Apr–Mar (SL default)' },
  { token: 'last_fy', title: 'Last financial year', hint: 'Previous FY' },
];

export function readPeriodCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function writePeriodCookie(token: string) {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 180;
  document.cookie = `${COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax`;
}

/** Prefer URL period, else cookie (client navigation continuity). */
export function pickPeriodParam(urlPeriod: string | null | undefined): string {
  if (urlPeriod) return normalizePeriodToken(urlPeriod);
  const c = readPeriodCookie();
  return c ? normalizePeriodToken(c) : 'this_month';
}
