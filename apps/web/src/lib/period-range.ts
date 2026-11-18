/**
 * Universal BookOne period range.
 * Encoded in URL ?period=… and cookie bookone_period for cross-module continuity.
 *
 * Tokens:
 *   all | today | yesterday | last_7d | last_30d | mtd | qtd | ytd
 *   this_month | last_month | this_fy | last_fy
 *   YYYY-MM (calendar month)
 *   YYYY-MM-DD_YYYY-MM-DD (custom inclusive range)
 *
 * Dashboard presets prefer today / mtd / qtd / ytd. `this_month` remains the
 * full calendar month (including future days) for existing links.
 */

export type PeriodToken =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last_7d'
  | 'last_30d'
  | 'mtd'
  | 'qtd'
  | 'ytd'
  | 'this_month'
  | 'last_month'
  | 'this_fy'
  | 'last_fy'
  | string; // month or custom

export const NAMED_PERIOD_TOKENS = [
  'all',
  'today',
  'yesterday',
  'last_7d',
  'last_30d',
  'mtd',
  'qtd',
  'ytd',
  'this_month',
  'last_month',
  'this_fy',
  'last_fy',
] as const;

export const MAX_PERIOD_DAYS = 1826;

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

export function calendarDateInZone(now: Date, timeZone?: string): string {
  if (!timeZone) return isoDate(now);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) return isoDate(now);
  return `${y}-${m}-${d}`;
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function startOfMonth(y: number, m0: number): Date {
  return new Date(y, m0, 1);
}

function endOfMonth(y: number, m0: number): Date {
  return new Date(y, m0 + 1, 0);
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
  if ((NAMED_PERIOD_TOKENS as readonly string[]).includes(raw)) return raw;
  if (isValidMonth(raw)) return raw;
  if (isCustomToken(raw)) return raw;
  return 'this_month';
}

export function resolvePeriodBounds(
  raw?: string | null,
  opts?: { now?: Date; fyStartMonth?: number; timeZone?: string; todayIso?: string },
): PeriodBounds {
  const now = opts?.now ?? new Date();
  const fyStart = opts?.fyStartMonth ?? DEFAULT_FY_START_MONTH;
  const todayIso = opts?.todayIso ?? calendarDateInZone(now, opts?.timeZone);
  const today = fromIso(todayIso);
  const token = normalizePeriodToken(raw);

  if (token === 'all') {
    return { token: 'all', from: null, to: null, label: 'All time', hint: 'No date filter' };
  }

  if (token === 'today') {
    return {
      token,
      from: todayIso,
      to: todayIso,
      label: 'Today',
      hint: todayIso,
    };
  }

  if (token === 'yesterday') {
    const y = addDaysIso(todayIso, -1);
    return {
      token,
      from: y,
      to: y,
      label: 'Yesterday',
      hint: y,
    };
  }

  if (token === 'last_7d') {
    return {
      token,
      from: addDaysIso(todayIso, -6),
      to: todayIso,
      label: 'Last 7 days',
      hint: 'Rolling week',
    };
  }

  if (token === 'last_30d') {
    return {
      token,
      from: addDaysIso(todayIso, -29),
      to: todayIso,
      label: 'Last 30 days',
      hint: 'Rolling month',
    };
  }

  if (token === 'mtd') {
    const from = startOfMonth(today.getFullYear(), today.getMonth());
    return {
      token,
      from: isoDate(from),
      to: todayIso,
      label: 'Month to date',
      hint: `${isoDate(from)} → ${todayIso}`,
    };
  }

  if (token === 'qtd') {
    const month = today.getMonth() + 1;
    const elapsed = ((month - fyStart) % 12 + 12) % 12;
    const qIndex = Math.floor(elapsed / 3);
    const qStartMonth0 = (fyStart - 1 + qIndex * 3) % 12;
    const qStartYear = today.getMonth() >= qStartMonth0 ? today.getFullYear() : today.getFullYear() - 1;
    const from = startOfMonth(qStartYear, qStartMonth0);
    return {
      token,
      from: isoDate(from),
      to: todayIso,
      label: 'Quarter to date',
      hint: `${isoDate(from)} → ${todayIso}`,
    };
  }

  if (token === 'ytd') {
    const { from } = fyBounds(today, fyStart);
    return {
      token,
      from: isoDate(from),
      to: todayIso,
      label: 'Year to date',
      hint: `${isoDate(from)} → ${todayIso}`,
    };
  }

  if (token === 'this_month') {
    const from = startOfMonth(today.getFullYear(), today.getMonth());
    const to = endOfMonth(today.getFullYear(), today.getMonth());
    return {
      token,
      from: isoDate(from),
      to: isoDate(to),
      label: from.toLocaleString('en-GB', { month: 'short', year: 'numeric' }),
      hint: 'This month',
    };
  }

  if (token === 'last_month') {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
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
    const { from, to, startYear } = fyBounds(today, fyStart);
    return {
      token,
      from: isoDate(from),
      to: isoDate(to),
      label: `FY ${startYear}/${String(startYear + 1).slice(2)}`,
      hint: 'This financial year',
    };
  }

  if (token === 'last_fy') {
    const cur = fyBounds(today, fyStart);
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
    const days = Math.floor((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000) + 1;
    const cappedTo = days > MAX_PERIOD_DAYS ? addDaysIso(a, MAX_PERIOD_DAYS - 1) : b;
    const label =
      a === cappedTo
        ? a
        : `${a.slice(8)}/${a.slice(5, 7)} – ${cappedTo.slice(8)}/${cappedTo.slice(5, 7)}`;
    return {
      token: encodeCustomRange(a, cappedTo),
      from: a,
      to: cappedTo,
      label,
      hint: days > MAX_PERIOD_DAYS ? `Custom range (capped at ${MAX_PERIOD_DAYS} days)` : 'Custom range',
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
  { token: 'today', title: 'Today', hint: 'Company calendar day' },
  { token: 'yesterday', title: 'Yesterday', hint: 'Previous company day' },
  { token: 'last_7d', title: 'Last 7 days', hint: 'Rolling week' },
  { token: 'mtd', title: 'Month to date', hint: '1st of month → today' },
  { token: 'qtd', title: 'Quarter to date', hint: 'Fiscal quarter → today' },
  { token: 'ytd', title: 'Year to date', hint: 'Fiscal year start → today' },
  { token: 'last_30d', title: 'Last 30 days', hint: 'Rolling month' },
  { token: 'this_month', title: 'This month', hint: 'Full calendar month' },
  { token: 'last_month', title: 'Last month', hint: 'Previous calendar month' },
  { token: 'this_fy', title: 'This financial year', hint: 'Apr–Mar (SL default)' },
  { token: 'last_fy', title: 'Last financial year', hint: 'Previous FY' },
  { token: 'all', title: 'All time', hint: 'No date filter' },
];

export function previousPeriodToken(token: string, opts?: { now?: Date; fyStartMonth?: number; timeZone?: string }): PeriodBounds {
  const current = resolvePeriodBounds(token, opts);
  if (!current.from || !current.to) {
    return { token: 'all', from: null, to: null, label: 'No baseline', hint: 'All-time has no previous interval' };
  }
  const days = Math.floor((Date.parse(`${current.to}T12:00:00Z`) - Date.parse(`${current.from}T12:00:00Z`)) / 86400000) + 1;
  const prevTo = addDaysIso(current.from, -1);
  const prevFrom = addDaysIso(prevTo, -(days - 1));
  return {
    token: encodeCustomRange(prevFrom, prevTo),
    from: prevFrom,
    to: prevTo,
    label: `Previous ${days} day${days === 1 ? '' : 's'}`,
    hint: `${prevFrom} → ${prevTo}`,
  };
}

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
