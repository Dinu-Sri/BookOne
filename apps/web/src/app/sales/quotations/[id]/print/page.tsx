import { redirect } from 'next/navigation';
import { getDocumentPrintModel } from '@/app/actions/document-print';
import { DocumentPrintSheet } from '@/components/print/document-print-sheet';

export default async function QuotationPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let model;
  try {
    model = await getDocumentPrintModel(id);
  } catch {
    redirect('/login');
  }
  if (!model || model.kind !== 'quotation') redirect('/sales/quotations');

  return <DocumentPrintSheet model={model} backHref="/sales/quotations" backLabel="Back to quotations" />;
}
