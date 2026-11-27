import * as XLSX from 'xlsx';
import type { Statement } from '@bookone/accounting';
import { getFinancialStatements } from '@/app/actions/financial-statements';

export const dynamic = 'force-dynamic';

const NUM = '#,##0.00;(#,##0.00);"-"';

function longDate(iso: string | null) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function sheetFor(s: Statement, company: string, sub: string, cur: string, cmp: string | null) {
  const rows: (string | number | null)[][] = [[company], [s.title], [sub], [], ['', cur, ...(cmp ? [cmp] : [])], ['', 'LKR', ...(cmp ? ['LKR'] : [])]];
  for (const l of s.lines) {
    if (l.kind === 'heading') rows.push([l.label]);
    else rows.push([`${l.level ? '   ' : ''}${l.label}`, l.amount, ...(cmp ? [l.compare ?? 0] : [])]);
  }
  rows.push([], ['Presented in the format of SLFRS for SMEs. Prepared from BookOne. Review by a qualified accountant before approval.']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 58 }, { wch: 18 }, { wch: 18 }];
  for (let r = 6; r < rows.length; r += 1) {
    for (const c of [1, 2]) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = NUM;
    }
  }
  return ws;
}

/** Excel workbook of the four statements (and the accounts behind each line) for a period. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  let pack;
  try {
    pack = await getFinancialStatements(url.searchParams.get('period') ?? 'this_fy');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Not allowed';
    return new Response(msg, { status: /permission/i.test(msg) ? 403 : 401 });
  }
  const { from, to } = pack.period;
  const forPeriod = from && to ? `For the period ${longDate(from)} to ${longDate(to)}` : 'For all time';
  const cur = pack.period.label || 'This period';
  const cmp = pack.compare ? `${longDate(pack.compare.from)} – ${longDate(pack.compare.to)}` : null;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFor(pack.profitOrLoss, pack.company.name, forPeriod, cur, cmp), 'Profit or loss');
  XLSX.utils.book_append_sheet(
    wb,
    sheetFor(pack.financialPosition, pack.company.name, `As at ${longDate(to) || 'today'}`, to ? longDate(to) : 'Today', pack.compare ? longDate(pack.compare.to) : null),
    'Financial position',
  );
  XLSX.utils.book_append_sheet(wb, sheetFor(pack.changesInEquity, pack.company.name, forPeriod, cur, null), 'Changes in equity');
  XLSX.utils.book_append_sheet(wb, sheetFor(pack.cashFlows, pack.company.name, forPeriod, cur, cmp), 'Cash flows');

  const notes: (string | number | null)[][] = [[pack.company.name], ['Accounts behind each line'], [], ['Statement', 'Line', 'Account', cur, ...(cmp ? [cmp] : [])]];
  for (const s of [pack.profitOrLoss, pack.financialPosition, pack.cashFlows]) {
    for (const l of s.lines) {
      for (const a of l.accounts ?? []) {
        notes.push([s.title, l.label, `${/^\d/.test(a.code) ? `${a.code} ` : ''}${a.name}`, a.amount, ...(cmp ? [a.compare ?? 0] : [])]);
      }
    }
  }
  const wsNotes = XLSX.utils.aoa_to_sheet(notes);
  wsNotes['!cols'] = [{ wch: 36 }, { wch: 40 }, { wch: 40 }, { wch: 18 }, { wch: 18 }];
  for (let r = 4; r < notes.length; r += 1) {
    for (const c of [3, 4]) {
      const cell = wsNotes[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = NUM;
    }
  }
  XLSX.utils.book_append_sheet(wb, wsNotes, 'Notes');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const safe = `${pack.company.name}-${pack.period.label}`.replace(/[^\w.-]+/g, '-').slice(0, 60);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="financial-statements-${safe}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
