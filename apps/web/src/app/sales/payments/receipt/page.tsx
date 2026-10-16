import { redirect } from 'next/navigation';
import { loadPaymentPrintFacts } from '@/app/actions/documents';
import { getReceiptPrintModel } from '@/app/actions/document-print';
import { DocumentPrintSheet } from '@/components/print/document-print-sheet';

export default async function CustomerPaymentReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{
    payment?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const paymentIds = Array.isArray(sp.payment) ? sp.payment : sp.payment ? [sp.payment] : [];
  let facts;
  try {
    facts = await loadPaymentPrintFacts(paymentIds);
  } catch {
    redirect('/login');
  }
  const rows = (facts?.rows ?? []).map((r) => ({
    number: r.number,
    customer: r.partyName,
    amount: r.amount,
  }));
  let model;
  try {
    model = await getReceiptPrintModel({
      date: facts?.date || '',
      account: facts?.account || '',
      customer: facts?.partyName ?? 'Customer',
      rows,
      total: facts?.total ?? 0,
    });
  } catch {
    redirect('/login');
  }

  return <DocumentPrintSheet model={model} backHref="/sales/payments" backLabel="Receive payments" />;
}
