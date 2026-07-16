import { redirect } from 'next/navigation';

/** Legacy AR/AP page — split into Sales invoices and Purchase bills. */
export default function DocumentsLegacyPage() {
  redirect('/sales/invoices');
}
