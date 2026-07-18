import { redirect } from 'next/navigation';
import { listOpenApBills } from '@/app/actions/commercial-docs';
import { getDocumentFormOptions } from '@/app/actions/documents';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PayVendorsForm } from '@/components/purchase/pay-vendors-form';

export default async function NewVendorPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string }>;
}) {
  const sp = await searchParams;
  let tenant;
  let bills;
  let options;
  try {
    [tenant, bills, options] = await Promise.all([
      getTenantInfo(),
      listOpenApBills(),
      getDocumentFormOptions(),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Pay Vendors" tenant={tenant}>
      <PayVendorsForm
        bills={bills}
        paymentAccounts={options.paymentAccounts}
        preselectId={sp.documentId ?? null}
      />
    </BookOneShell>
  );
}
