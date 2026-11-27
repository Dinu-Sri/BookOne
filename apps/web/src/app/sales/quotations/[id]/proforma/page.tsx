import { redirect } from 'next/navigation';
import { getDocumentPrintModel } from '@/app/actions/document-print';
import { DocumentPrintSheet } from '@/components/print/document-print-sheet';

/** Proforma invoice printed from a quotation. */
export default async function QuotationProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let model;
  try {
    model = await getDocumentPrintModel(id, { printAs: 'proforma_invoice' });
  } catch {
    redirect('/login');
  }
  if (!model) redirect('/sales/quotations');
  // Without an approved design the standard print is used, titled for this print item.
  const shown = model.design ? model : { ...model, title: 'PROFORMA INVOICE' };
  return <DocumentPrintSheet model={shown} backHref={`/sales/quotations/${id}/edit`} backLabel="Back to quotation" />;
}
