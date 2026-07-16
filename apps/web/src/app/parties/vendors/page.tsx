import { redirect } from 'next/navigation';
import { listParties, type PartyListFilter } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PartyListScreen } from '@/components/parties/party-list';

interface SearchParams {
  q?: string;
  status?: string;
  dualOnly?: string;
  taxStatus?: string;
  hasBalance?: string;
  sort?: string;
  dir?: string;
}

export default async function VendorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filter: PartyListFilter = {
    kind: 'vendor',
    q: params.q,
    status: (params.status as PartyListFilter['status']) || 'active',
    dualOnly: (params.dualOnly as PartyListFilter['dualOnly']) || 'all',
    taxStatus: (params.taxStatus as PartyListFilter['taxStatus']) || 'all',
    hasBalance: (params.hasBalance as PartyListFilter['hasBalance']) || 'all',
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
      <PartyListScreen role="vendor" rows={rows} filter={filter} />
    </BookOneShell>
  );
}
