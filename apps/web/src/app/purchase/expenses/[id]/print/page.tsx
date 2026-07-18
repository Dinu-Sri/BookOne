import { redirect } from 'next/navigation';

/** Alias → shared purchase print */
export default async function CashPurchasePrintAlias({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/purchase/print/${id}`);
}
