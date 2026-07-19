import { redirect } from 'next/navigation';
import { listOpenArInvoices } from '@/app/actions/commercial-docs';
import { getDocumentFormOptions } from '@/app/actions/documents';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { ReceivePaymentsForm } from '@/components/sales/receive-payments-form';

export default async function NewReceivePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string }>;
}) {
  const sp = await searchParams;
  let tenant;
  let invoices;
  let options;
  try {
    [tenant, invoices, options] = await Promise.all([
      getTenantInfo(),
      listOpenArInvoices(),
      getDocumentFormOptions(),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Receive Payments" tenant={tenant}>
      <ReceivePaymentsForm
        invoices={invoices}
        paymentAccounts={options.paymentAccounts}
        preselectId={sp.documentId ?? null}
      />
    </BookOneShell>
  );
}
