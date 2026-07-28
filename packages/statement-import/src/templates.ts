import type { ColumnMap, ParseProfile, SignConvention } from './types';

const DATE_KEYS = [
  'tran date',
  'transaction date',
  'txn date',
  'value date',
  'trans date',
  'posted',
  'date',
  'දිනය',
];
const DESC_KEYS = [
  'particulars',
  'description',
  'narrative',
  'narration',
  'transaction details',
  'memo',
  'details',
  'විස්තර',
];
const AMOUNT_KEYS = ['amount', 'txn amount', 'transaction amount', 'value', 'මුදල'];
const DEBIT_KEYS = ['debit', 'withdrawal', 'paid out', 'withdrawals', 'money out'];
const CREDIT_KEYS = ['credit', 'deposit', 'paid in', 'deposits', 'money in'];
const BALANCE_KEYS = [
  'principal balance',
  'running balance',
  'available balance',
  'closing balance',
  'balance',
];
const REF_KEYS = ['ref', 'reference', 'cheque', 'chq', 'serial no', 'serial', 'txn id', 'transaction id'];
/** Combined DR/CR flag — must NOT be treated as separate debit/credit amount columns */
const TYPE_KEYS = ['dr/cr', 'dr cr', 'd/c', 'txn type', 'transaction type', 'type', 'cd'];

function normHeader(cell: string): string {
  return cell.toLowerCase().replace(/\s+/g, ' ').trim();
}

function scoreHeaderCell(cell: string, keys: string[]): number {
  const h = normHeader(cell);
  if (!h) return 0;
  for (const k of keys) {
    if (h === k) return 4;
    // word-boundary-ish: avoid "dr" matching inside "dr/cr" for debit keys
    if (h.startsWith(k + ' ') || h.endsWith(' ' + k) || h.includes(' ' + k + ' ')) return 3;
    if (h.includes(k) && k.length >= 4) return 2;
  }
  return 0;
}

function isTypeHeader(cell: string): boolean {
  const h = normHeader(cell);
  if (!h) return false;
  if (TYPE_KEYS.some((k) => h === k || h.includes(k))) return true;
  // bare DR/CR style
  if (/^(dr|cr|d|c)$/i.test(h)) return true;
  return false;
}

function scoreRowAsHeader(row: unknown[]): number {
  const cells = row.map((c) => String(c ?? ''));
  let score = 0;
  for (const c of cells) {
    if (isTypeHeader(c)) score += 3;
    else {
      score += scoreHeaderCell(c, DATE_KEYS);
      score += scoreHeaderCell(c, DESC_KEYS);
      score += scoreHeaderCell(c, AMOUNT_KEYS);
      score += scoreHeaderCell(c, DEBIT_KEYS);
      score += scoreHeaderCell(c, CREDIT_KEYS);
      score += scoreHeaderCell(c, BALANCE_KEYS);
    }
  }
  return score;
}

function mapFromHeaders(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  headers.forEach((h, i) => {
    const cell = normHeader(h);
    if (!cell) return;

    // Type column first (Sampath "DR/CR")
    if (map.type == null && isTypeHeader(cell)) {
      map.type = i;
      return;
    }

    if (map.date == null && scoreHeaderCell(cell, DATE_KEYS) > 0) map.date = i;
    if (map.description == null && scoreHeaderCell(cell, DESC_KEYS) > 0) map.description = i;
    if (map.amount == null && scoreHeaderCell(cell, AMOUNT_KEYS) > 0) map.amount = i;

    // Only map debit/credit if NOT a combined type header
    if (!isTypeHeader(cell)) {
      if (map.debit == null && scoreHeaderCell(cell, DEBIT_KEYS) > 0) map.debit = i;
      if (map.credit == null && scoreHeaderCell(cell, CREDIT_KEYS) > 0) map.credit = i;
    }

    if (map.balance == null && scoreHeaderCell(cell, BALANCE_KEYS) > 0) map.balance = i;
    if (map.ref == null && scoreHeaderCell(cell, REF_KEYS) > 0) map.ref = i;
  });
  return map;
}

function pickSignConvention(map: ColumnMap): SignConvention {
  if (map.type != null && map.amount != null) return 'amount_with_type';
  if (map.debit != null || map.credit != null) return 'debit_credit';
  return 'signed_amount';
}

export const GENERIC_PROFILES: ParseProfile[] = [
  {
    name: 'Generic debit/credit',
    signConvention: 'debit_credit',
    columnMap: {},
  },
  {
    name: 'Generic signed amount',
    signConvention: 'signed_amount',
    columnMap: {},
  },
  {
    name: 'Generic amount + DR/CR',
    signConvention: 'amount_with_type',
    columnMap: {},
  },
];

export function detectHeaderAndMap(matrix: unknown[][]): {
  profile: ParseProfile;
  headerRowIndex: number;
  auto: boolean;
} {
  let bestIdx = 0;
  let bestScore = -1;
  const scan = Math.min(matrix.length, 40);
  for (let i = 0; i < scan; i++) {
    const s = scoreRowAsHeader(matrix[i] ?? []);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }

  const headers = (matrix[bestIdx] ?? []).map((c) => String(c ?? ''));
  const columnMap = mapFromHeaders(headers);
  const signConvention = pickSignConvention(columnMap);

  let name = 'Auto signed amount';
  if (signConvention === 'amount_with_type') name = 'Auto amount + DR/CR';
  else if (signConvention === 'debit_credit') name = 'Auto debit/credit';

  const profile: ParseProfile = {
    name,
    signConvention,
    columnMap,
    skipRows: bestIdx,
  };

  return { profile, headerRowIndex: bestIdx, auto: true };
}

/** Human labels for mapping UI */
export const FIELD_LABELS: { key: keyof ColumnMap; label: string; hint: string }[] = [
  { key: 'date', label: 'Date', hint: 'Transaction date' },
  { key: 'description', label: 'Description', hint: 'Particulars / narrative' },
  { key: 'amount', label: 'Amount', hint: 'Single amount column' },
  { key: 'type', label: 'DR/CR type', hint: 'D or C / Debit or Credit flag' },
  { key: 'debit', label: 'Debit (out)', hint: 'Money leaving the account' },
  { key: 'credit', label: 'Credit (in)', hint: 'Money entering the account' },
  { key: 'balance', label: 'Balance', hint: 'Running / principal balance (optional)' },
  { key: 'ref', label: 'Reference', hint: 'Cheque / serial (optional)' },
];
