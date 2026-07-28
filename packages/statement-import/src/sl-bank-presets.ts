/**
 * Sri Lanka multi-bank layout strategy
 * ------------------------------------
 * There are 30+ banks/finance houses with different Excel/CSV exports.
 * We NEVER hard-require one global format. Instead:
 *
 *  1) AUTO   — header scan suggests columns + sign convention
 *  2) PRESET — user picks a known bank style (half-auto starter map)
 *  3) MANUAL — user sets every column; sample amounts must look right
 *  4) LEARN  — confirmed map is saved per tenant bank and reused
 *
 * Presets are *starters* (header keywords + convention), not rigid parsers.
 * Real files still go through the confirm-mapping step.
 */

import type { ParseProfile, SignConvention } from './types';

export type SlBankPresetId =
  | 'auto'
  | 'manual'
  | 'sampath_vishwa'
  | 'hnb_activity'
  | 'boc_generic'
  | 'commercial_generic'
  | 'peoples_generic'
  | 'ntb_generic'
  | 'seylan_generic'
  | 'dfcc_generic'
  | 'nsb_generic'
  | 'debit_credit_generic'
  | 'amount_drcr_generic'
  | 'signed_amount_generic';

export type SlBankPreset = {
  id: SlBankPresetId;
  /** Short label for elderly-friendly UI */
  label: string;
  /** Optional Sinhala gloss */
  labelSi?: string;
  /** Free-text match against bank account name or file header */
  matchHints: string[];
  description: string;
  /** Starter profile — column indexes left empty until auto-detect fills or user maps */
  signConvention: SignConvention;
  /** Preferred header cell substrings for each field (used when applying preset on a matrix) */
  headerHints: {
    date?: string[];
    description?: string[];
    amount?: string[];
    type?: string[];
    debit?: string[];
    credit?: string[];
    balance?: string[];
    ref?: string[];
  };
};

export const SL_BANK_PRESETS: SlBankPreset[] = [
  {
    id: 'auto',
    label: 'Auto-detect (any bank)',
    labelSi: 'ස්වයං හඳුනාගැනීම',
    matchHints: [],
    description: 'Scan the file and guess columns. You still confirm before import.',
    signConvention: 'debit_credit',
    headerHints: {},
  },
  {
    id: 'manual',
    label: 'Manual — map every column',
    labelSi: 'අතින් සිතියම්',
    matchHints: [],
    description: 'Best when the file looks unusual. You choose header row and each column.',
    signConvention: 'debit_credit',
    headerHints: {},
  },
  {
    id: 'sampath_vishwa',
    label: 'Sampath Vishwa (Amount + DR/CR)',
    matchHints: ['sampath', 'vishwa'],
    description: 'Tran Date, Particulars, DR/CR, Amount, Balance — common Sampath Vishwa export.',
    signConvention: 'amount_with_type',
    headerHints: {
      date: ['tran date', 'transaction date'],
      description: ['particulars', 'description'],
      type: ['dr/cr', 'dr cr'],
      amount: ['amount'],
      balance: ['balance'],
    },
  },
  {
    id: 'hnb_activity',
    label: 'HNB / Account Activity (Debit + Credit)',
    matchHints: ['hnb', 'hatton', 'account activity'],
    description: 'Transaction Date, Description, Debit, Credit, Principal Balance.',
    signConvention: 'debit_credit',
    headerHints: {
      date: ['transaction date', 'value date'],
      description: ['description'],
      debit: ['debit'],
      credit: ['credit'],
      balance: ['principal balance', 'balance'],
    },
  },
  {
    id: 'boc_generic',
    label: 'Bank of Ceylon (typical Debit/Credit)',
    matchHints: ['boc', 'bank of ceylon', 'ceylon'],
    description: 'Usually separate Debit and Credit columns with a date and description.',
    signConvention: 'debit_credit',
    headerHints: {
      date: ['date', 'txn date', 'transaction date'],
      description: ['description', 'particulars', 'narrative'],
      debit: ['debit', 'withdrawal'],
      credit: ['credit', 'deposit'],
      balance: ['balance'],
    },
  },
  {
    id: 'commercial_generic',
    label: 'Commercial Bank (typical Debit/Credit)',
    matchHints: ['commercial', 'combank', 'cbc'],
    description: 'Date + particulars + debit/credit style statement.',
    signConvention: 'debit_credit',
    headerHints: {
      date: ['date', 'txn date', 'transaction date'],
      description: ['particulars', 'description', 'narrative'],
      debit: ['debit', 'withdrawal'],
      credit: ['credit', 'deposit'],
      balance: ['balance'],
    },
  },
  {
    id: 'peoples_generic',
    label: "People's Bank (typical Debit/Credit)",
    matchHints: ['people', "people's", 'peoples'],
    description: 'Common SL export with Debit and Credit columns.',
    signConvention: 'debit_credit',
    headerHints: {
      date: ['date', 'transaction date'],
      description: ['description', 'particulars'],
      debit: ['debit'],
      credit: ['credit'],
      balance: ['balance'],
    },
  },
  {
    id: 'ntb_generic',
    label: 'Nations Trust Bank (NTB)',
    matchHints: ['ntb', 'nations trust'],
    description: 'Start from Debit/Credit; adjust columns if your export differs.',
    signConvention: 'debit_credit',
    headerHints: {
      date: ['date', 'txn date'],
      description: ['description', 'particulars'],
      debit: ['debit'],
      credit: ['credit'],
      balance: ['balance'],
    },
  },
  {
    id: 'seylan_generic',
    label: 'Seylan Bank',
    matchHints: ['seylan'],
    description: 'Typical Debit/Credit statement; confirm columns on first import.',
    signConvention: 'debit_credit',
    headerHints: {
      date: ['date', 'transaction date'],
      description: ['description', 'particulars'],
      debit: ['debit'],
      credit: ['credit'],
      balance: ['balance'],
    },
  },
  {
    id: 'dfcc_generic',
    label: 'DFCC Bank',
    matchHints: ['dfcc'],
    description: 'Typical Debit/Credit; map manually if headers differ.',
    signConvention: 'debit_credit',
    headerHints: {
      date: ['date', 'transaction date'],
      description: ['description', 'particulars'],
      debit: ['debit'],
      credit: ['credit'],
      balance: ['balance'],
    },
  },
  {
    id: 'nsb_generic',
    label: 'NSB (National Savings Bank)',
    matchHints: ['nsb', 'national savings'],
    description: 'Often Debit/Credit; use Manual if your download is different.',
    signConvention: 'debit_credit',
    headerHints: {
      date: ['date', 'transaction date'],
      description: ['description', 'particulars'],
      debit: ['debit'],
      credit: ['credit'],
      balance: ['balance'],
    },
  },
  {
    id: 'debit_credit_generic',
    label: 'Any bank — Debit + Credit columns',
    matchHints: [],
    description: 'Most SL banks: money out in Debit, money in in Credit.',
    signConvention: 'debit_credit',
    headerHints: {
      date: ['date', 'txn', 'tran'],
      description: ['description', 'particulars', 'narrative', 'details'],
      debit: ['debit', 'withdrawal', 'dr'],
      credit: ['credit', 'deposit', 'cr'],
      balance: ['balance'],
    },
  },
  {
    id: 'amount_drcr_generic',
    label: 'Any bank — Amount + DR/CR flag',
    matchHints: [],
    description: 'One Amount column plus D/C or DR/CR (Sampath-style family).',
    signConvention: 'amount_with_type',
    headerHints: {
      date: ['date', 'txn', 'tran'],
      description: ['description', 'particulars', 'narrative'],
      amount: ['amount', 'value'],
      type: ['dr/cr', 'dr cr', 'type', 'd/c'],
      balance: ['balance'],
    },
  },
  {
    id: 'signed_amount_generic',
    label: 'Any bank — single signed Amount (+/−)',
    matchHints: [],
    description: 'One amount column already negative for outflows.',
    signConvention: 'signed_amount',
    headerHints: {
      date: ['date', 'txn', 'tran'],
      description: ['description', 'particulars'],
      amount: ['amount', 'value'],
      balance: ['balance'],
    },
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Guess a preset from BookOne bank account name or file title text. */
export function suggestPresetFromBankName(bankName: string): SlBankPresetId {
  const n = norm(bankName);
  for (const p of SL_BANK_PRESETS) {
    if (p.id === 'auto' || p.id === 'manual') continue;
    if (p.matchHints.some((h) => n.includes(norm(h)))) return p.id;
  }
  return 'auto';
}

export function getPreset(id: string): SlBankPreset | undefined {
  return SL_BANK_PRESETS.find((p) => p.id === id);
}

/**
 * Apply a preset's header hints onto a header row to produce a columnMap.
 * Returns partial map — missing fields stay unset for user fill-in.
 */
export function applyPresetToHeaders(
  preset: SlBankPreset,
  headerCells: string[],
): ParseProfile {
  const headers = headerCells.map(norm);
  const columnMap: ParseProfile['columnMap'] = {};

  const findCol = (hints?: string[]): number | undefined => {
    if (!hints?.length) return undefined;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i] ?? '';
      if (!h) continue;
      for (const hint of hints) {
        const hh = norm(hint);
        if (h === hh || h.includes(hh)) return i;
      }
    }
    return undefined;
  };

  const date = findCol(preset.headerHints.date);
  const description = findCol(preset.headerHints.description);
  const amount = findCol(preset.headerHints.amount);
  const type = findCol(preset.headerHints.type);
  const debit = findCol(preset.headerHints.debit);
  const credit = findCol(preset.headerHints.credit);
  const balance = findCol(preset.headerHints.balance);
  const ref = findCol(preset.headerHints.ref);

  if (date != null) columnMap.date = date;
  if (description != null) columnMap.description = description;
  if (amount != null) columnMap.amount = amount;
  if (type != null) columnMap.type = type;
  if (debit != null) columnMap.debit = debit;
  if (credit != null) columnMap.credit = credit;
  if (balance != null) columnMap.balance = balance;
  if (ref != null) columnMap.ref = ref;

  return {
    name: preset.label,
    bankHint: preset.matchHints[0],
    columnMap,
    signConvention: preset.signConvention,
  };
}

export function listPresetsForUi(): {
  id: SlBankPresetId;
  label: string;
  labelSi?: string;
  description: string;
  group: 'quick' | 'named' | 'generic';
}[] {
  return SL_BANK_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    labelSi: p.labelSi,
    description: p.description,
    group:
      p.id === 'auto' || p.id === 'manual'
        ? 'quick'
        : p.id.endsWith('_generic') && !p.matchHints.length
          ? 'generic'
          : 'named',
  }));
}
