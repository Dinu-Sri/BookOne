import { redirect } from 'next/navigation';
import { getDocumentPrintModel } from '@/app/actions/document-print';
import { DocumentPrintSheet } from '@/components/print/document-print-sheet';

/** Dispatch note (sales order) print. */
export default async function SalesOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let model;
  try {
    model = await getDocumentPrintModel(id, { printAs: 'sales_order' });
  } catch {
    redirect('/login');
  }
  if (!model) redirect('/sales/orders');
  // Without an approved design the standard print is used, titled for this print item.
  const shown = model.design ? model : { ...model, title: 'DISPATCH NOTE' };
  return <DocumentPrintSheet model={shown} backHref={`/sales/orders/${id}`} backLabel="Back to sales order" />;
}
