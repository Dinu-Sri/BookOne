import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { listParties, type PartyListFilter } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PartyListScreen } from '@/components/parties/party-list';

interface SearchParams {
  q?: string;
  sort?: string;
  dir?: string;
  from?: string;
  to?: string;
  page?: string;
}

export default async function VendorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filter: PartyListFilter = {
    kind: 'vendor',
    q: params.q,
    status: 'active',
    sort: (params.sort as PartyListFilter['sort']) || 'name',
    dir: (params.dir as PartyListFilter['dir']) || 'asc',
  };

  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listParties(filter)]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Vendors" tenant={tenant}>
      <Suspense fallback={<div className="workspace">Loading…</div>}>
        <PartyListScreen role="vendor" rows={rows} filter={filter} />
      </Suspense>
    </BookOneShell>
  );
}
