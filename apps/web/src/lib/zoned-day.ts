/** Start or end of a calendar day in an IANA timezone, as an ISO string with offset (WP2 sale dates). */
export function zonedDayBoundary(date: string, timeZone: string, end: boolean): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Dates must look like 2026-12-01.');
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const noonUtc = Date.UTC(y, m - 1, d, 12);
  let offsetMin = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(noonUtc));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    offsetMin = Math.round((local - noonUtc) / 60000);
  } catch {
    offsetMin = 0;
  }
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${date}T${end ? '23:59:59' : '00:00:00'}${off}`;
}
