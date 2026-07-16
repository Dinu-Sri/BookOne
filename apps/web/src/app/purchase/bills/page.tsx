import { redirect } from 'next/navigation';

/** Legacy vendor bills route → Purchases module screen. */
export default function LegacyVendorBillsPage() {
  redirect('/purchase/purchases');
}
