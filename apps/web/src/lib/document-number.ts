export type NumberReset = 'monthly' | 'yearly' | 'never';

export function formatDocumentNumber(opts: {
  prefix: string;
  postfix: string;
  pad: number;
  reset: NumberReset;
  date: string;
  sequence: number;
}): string {
  const prefix = String(opts.prefix ?? '')
    .trim()
    .replace(/-+$/g, '');
  const postfix = String(opts.postfix ?? '').trim();
  const pad = Math.min(8, Math.max(2, Number(opts.pad) || 4));
  const seq = String(Math.max(1, Number(opts.sequence) || 1)).padStart(pad, '0');
  let datePart = '';
  if (opts.reset === 'monthly') datePart = opts.date.replace(/-/g, '');
  else if (opts.reset === 'yearly') datePart = opts.date.slice(0, 4);
  const body = [prefix, datePart, seq].filter(Boolean).join('-');
  return `${body}${postfix}`;
}

export function numberingWindow(
  reset: NumberReset,
  date: string,
): { from: string | null; to: string | null } {
  if (reset === 'monthly') {
    return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-31` };
  }
  if (reset === 'yearly') {
    return { from: `${date.slice(0, 4)}-01-01`, to: `${date.slice(0, 4)}-12-31` };
  }
  return { from: null, to: null };
}
