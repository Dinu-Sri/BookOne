import { notFound } from 'next/navigation';
import { getPublicPrintModel } from '@/app/actions/document-print';
import { DocumentPrintSheet } from '@/components/print/document-print-sheet';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let model;
  try {
    model = await getPublicPrintModel(token);
  } catch {
    notFound();
  }
  if (!model) notFound();
  return <DocumentPrintSheet model={model} publicView />;
}
