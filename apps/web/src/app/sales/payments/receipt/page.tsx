import { redirect } from 'next/navigation';
import { getCommercialDocument } from '@/app/actions/commercial-docs';
import { getReceiptPrintModel } from '@/app/actions/document-print';
import { DocumentPrintSheet } from '@/components/print/document-print-sheet';

export default async function CustomerPaymentReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    account?: string;
    total?: string;
    doc?: string | string[];
    amt?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const docIds = Array.isArray(sp.doc) ? sp.doc : sp.doc ? [sp.doc] : [];
  const amts = Array.isArray(sp.amt) ? sp.amt : sp.amt ? [sp.amt] : [];
  const rows: { number: string; customer: string; amount: number }[] = [];
  try {
    for (let i = 0; i < docIds.length; i++) {
      const detail = await getCommercialDocument(docIds[i]!).catch(() => null);
      if (!detail) continue;
      rows.push({
        number: detail.documentNumber,
        customer: detail.partyName,
        amount: Number(amts[i] ?? 0) || 0,
      });
    }
  } catch {
    redirect('/login');
  }
  const total = Number(sp.total) || rows.reduce((s, r) => s + r.amount, 0);
  const customerName = rows[0]?.customer ?? 'Customer';
  const allSame = rows.every((r) => r.customer === customerName);
  let model;
  try {
    model = await getReceiptPrintModel({
      date: sp.date || '',
      account: sp.account || '',
      customer: allSame ? customerName : 'Multiple customers',
      rows,
      total,
    });
  } catch {
    redirect('/login');
  }

  return <DocumentPrintSheet model={model} backHref="/sales/payments" backLabel="Receive payments" />;
}
