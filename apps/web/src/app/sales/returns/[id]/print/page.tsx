import { redirect } from 'next/navigation';
import { getDocumentPrintModel } from '@/app/actions/document-print';
import { DocumentPrintSheet } from '@/components/print/document-print-sheet';

export default async function SalesReturnPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let model;
  try {
    model = await getDocumentPrintModel(id);
  } catch {
    redirect('/login');
  }
  if (!model || !model.credit) redirect('/sales/returns');

  return <DocumentPrintSheet model={model} backHref="/sales/returns" backLabel="Back to sales returns" />;
}
