/**
 * English + optional Sinhala gloss for important labels only.
 * @see docs/ENTITY_UX_FLOWS.md
 */

export const SI_GLOSS: Record<string, string> = {
  money_in: 'ආදායම',
  money_out: 'වියදම',
  move_money: 'මුදල් මාරු',
  loan: 'ණය',
  loan_took: 'ණය ගත්තා',
  loan_paid: 'ණය ගෙව්වා',
  invoice: 'ඉන්වොයිස්',
  bill: 'බිල්පත',
  personal: 'පුද්ගලික',
  business: 'ව්‍යාපාර',
  cash: 'මුදල්',
  bank: 'බැංකුව',
  date: 'දිනය',
  amount: 'මුදල',
  from_whom: 'කවුරුන්ගෙන්',
  paid_to: 'ගෙවූ තැන',
  description: 'විස්තරය',
  save: 'සුරකින්න',
  this_month: 'මේ මාසය',
  year_summary: 'වසර සාරාංශය',
  import_excel: 'Excel එකතු කරන්න',
  home: 'මුල් පිටුව',
  settings: 'සැකසුම්',
  company: 'සමාගම',
  sole_prop: 'තනි හිමිකම',
  continue: 'ඉදිරියට',
  summary: 'සාරාංශය',
};

export const EN_LABEL: Record<string, string> = {
  money_in: 'Money In',
  money_out: 'Money Out',
  move_money: 'Move Money',
  loan: 'Loan',
  loan_took: 'Took a loan',
  loan_paid: 'Paid loan',
  invoice: 'Invoice',
  bill: 'Bill',
  personal: 'Personal',
  business: 'Business',
  cash: 'Cash',
  bank: 'Bank',
  date: 'Date',
  amount: 'Amount',
  from_whom: 'From whom',
  paid_to: 'Paid to',
  description: 'Description',
  save: 'Save',
  this_month: 'This month',
  year_summary: 'Year summary',
  import_excel: 'Import Excel',
  home: 'Home',
  settings: 'Settings',
  company: 'Company',
  sole_prop: 'Sole prop',
  continue: 'Continue',
  summary: 'Summary',
};

const STORAGE_KEY = 'bookone.siGloss';

export function readSiGlossPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSiGlossPreference(on: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** English or English (සිංහල) for a glossary key. */
export function gloss(key: string, si: boolean): string {
  const en = EN_LABEL[key] ?? key;
  if (!si) return en;
  const s = SI_GLOSS[key];
  return s ? `${en} (${s})` : en;
}
