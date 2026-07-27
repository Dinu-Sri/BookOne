/**
 * English / Sinhala labels for cashbook & onboarding.
 * When Sinhala mode is ON, replace English with Sinhala (no brackets).
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
  full_erp: 'සම්පූර්ණ පද්ධතිය',
  log_out: 'ඉවත් වන්න',
  net: 'ශුද්ධ',
  type: 'වර්ගය',
  who: 'කවුද',
  from: 'සිට',
  to: 'දක්වා',
  customer: 'පාරිභෝගික',
  vendor: 'සැපයුම්කරු',
  category: 'ප්‍රවර්ගය',
  due_date: 'ගෙවිය යුතු දිනය',
  close: 'වසන්න',
  note_optional: 'සටහන (විකල්ප)',
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
  full_erp: 'Full ERP',
  log_out: 'Log out',
  net: 'Net',
  type: 'Type',
  who: 'Who',
  from: 'From',
  to: 'To',
  customer: 'Customer',
  vendor: 'Vendor',
  category: 'Category',
  due_date: 'Due date',
  close: 'Close',
  note_optional: 'Note (optional)',
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

/**
 * UI label: English when off; Sinhala word when on (no brackets / dual text).
 */
export function gloss(key: string, si: boolean): string {
  if (si) {
    return SI_GLOSS[key] ?? EN_LABEL[key] ?? key;
  }
  return EN_LABEL[key] ?? key;
}

export function glossSi(key: string): string {
  return SI_GLOSS[key] ?? '';
}

export function glossEn(key: string): string {
  return EN_LABEL[key] ?? key;
}
