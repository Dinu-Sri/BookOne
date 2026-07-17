/** Simple English amount-in-words for LKR tax invoices. */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return `${TENS[t]}${o ? ` ${ONES[o]}` : ''}`.trim();
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return `${ONES[h]} Hundred${rest ? ` ${underThousand(rest)}` : ''}`.trim();
}

function integerToWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (n) parts.push(underThousand(n));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** e.g. 150000.50 → "Rupees One Lakh Fifty Thousand and Cents Fifty only" */
export function amountInWordsLkr(amount: number): string {
  const abs = Math.abs(Math.round((amount + Number.EPSILON) * 100) / 100);
  const rupees = Math.floor(abs);
  const cents = Math.round((abs - rupees) * 100);
  let words = `Rupees ${integerToWords(rupees)}`;
  if (cents > 0) words += ` and Cents ${integerToWords(cents)}`;
  words += ' only';
  return words;
}

/** Display date as MM/DD/YYYY from ISO YYYY-MM-DD */
export function formatDateMmDdYyyy(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso ?? '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
}
