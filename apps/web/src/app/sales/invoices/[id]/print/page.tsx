import { redirect } from 'next/navigation';
import { getDocumentPrintModel } from '@/app/actions/document-print';
import { DocumentPrintSheet } from '@/components/print/document-print-sheet';

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let model;
  try {
    model = await getDocumentPrintModel(id);
  } catch {
    redirect('/login');
  }
  if (!model) redirect('/sales/invoices');
  if (model.kind !== 'invoice' && model.kind !== 'tax_invoice') redirect('/sales/invoices');

  return <DocumentPrintSheet model={model} backHref="/sales/invoices" backLabel="Back to invoices" />;
}
