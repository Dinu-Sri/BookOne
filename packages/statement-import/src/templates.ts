import type { ColumnMap, ParseProfile } from './types';

const DATE_KEYS = ['date', 'posted', 'transaction date', 'txn date', 'value date', 'trans date', 'දිනය'];
const DESC_KEYS = [
  'description',
  'memo',
  'details',
  'narration',
  'particulars',
  'narrative',
  'transaction details',
  'විස්තර',
];
const AMOUNT_KEYS = ['amount', 'value', 'txn amount', 'transaction amount', 'මුදල'];
const DEBIT_KEYS = ['debit', 'withdrawal', 'paid out', 'dr', 'withdrawals', 'money out'];
const CREDIT_KEYS = ['credit', 'deposit', 'paid in', 'cr', 'deposits', 'money in'];
const BALANCE_KEYS = ['balance', 'running balance', 'available balance', 'closing'];
const REF_KEYS = ['ref', 'reference', 'cheque', 'chq', 'txn id', 'transaction id', 'serial'];

function scoreHeaderCell(cell: string, keys: string[]): number {
  const h = cell.toLowerCase().trim();
  if (!h) return 0;
  for (const k of keys) {
    if (h === k) return 3;
    if (h.includes(k)) return 2;
  }
  return 0;
}

function scoreRowAsHeader(row: unknown[]): number {
  const cells = row.map((c) => String(c ?? '').toLowerCase().trim());
  let score = 0;
  for (const c of cells) {
    score += scoreHeaderCell(c, DATE_KEYS);
    score += scoreHeaderCell(c, DESC_KEYS);
    score += scoreHeaderCell(c, AMOUNT_KEYS);
    score += scoreHeaderCell(c, DEBIT_KEYS);
    score += scoreHeaderCell(c, CREDIT_KEYS);
    score += scoreHeaderCell(c, BALANCE_KEYS);
  }
  return score;
}

function mapFromHeaders(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  headers.forEach((h, i) => {
    const cell = h.toLowerCase().trim();
    if (map.date == null && scoreHeaderCell(cell, DATE_KEYS) > 0) map.date = i;
    if (map.description == null && scoreHeaderCell(cell, DESC_KEYS) > 0) map.description = i;
    if (map.amount == null && scoreHeaderCell(cell, AMOUNT_KEYS) > 0) map.amount = i;
    if (map.debit == null && scoreHeaderCell(cell, DEBIT_KEYS) > 0) map.debit = i;
    if (map.credit == null && scoreHeaderCell(cell, CREDIT_KEYS) > 0) map.credit = i;
    if (map.balance == null && scoreHeaderCell(cell, BALANCE_KEYS) > 0) map.balance = i;
    if (map.ref == null && scoreHeaderCell(cell, REF_KEYS) > 0) map.ref = i;
  });
  return map;
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
];

export function detectHeaderAndMap(matrix: unknown[][]): {
  profile: ParseProfile;
  headerRowIndex: number;
  auto: boolean;
} {
  let bestIdx = 0;
  let bestScore = -1;
  const scan = Math.min(matrix.length, 25);
  for (let i = 0; i < scan; i++) {
    const s = scoreRowAsHeader(matrix[i] ?? []);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }

  const headers = (matrix[bestIdx] ?? []).map((c) => String(c ?? '').toLowerCase().trim());
  const columnMap = mapFromHeaders(headers);
  const hasDebitCredit = columnMap.debit != null || columnMap.credit != null;
  const profile: ParseProfile = {
    name: hasDebitCredit ? 'Auto debit/credit' : 'Auto signed amount',
    signConvention: hasDebitCredit ? 'debit_credit' : 'signed_amount',
    columnMap,
    skipRows: bestIdx,
  };

  return { profile, headerRowIndex: bestIdx, auto: true };
}
