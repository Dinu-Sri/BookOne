import { redirect } from 'next/navigation';

export default function LegacyNewBillPage() {
  redirect('/purchase/purchases/new');
}
