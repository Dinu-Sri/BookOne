import { redirect } from 'next/navigation';
import { listParties, type PartyListFilter } from '@/app/actions/parties';
import { getPeriodOptions, getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { PartyListScreen } from '@/components/parties/party-list';

interface SearchParams {
  q?: string;
  status?: string;
  sort?: string;
  dir?: string;
  period?: string;
}

export default async function VendorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filter: PartyListFilter = {
    kind: 'vendor',
    q: params.q,
    status: 'active',
    sort: (params.sort as PartyListFilter['sort']) || 'name',
    dir: (params.dir as PartyListFilter['dir']) || 'asc',
    period: params.period,
  };

  let tenant;
  let rows;
  let periodOptions;
  try {
    [tenant, rows, periodOptions] = await Promise.all([
      getTenantInfo(),
      listParties(filter),
      getPeriodOptions(params.period),
    ]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Vendors" tenant={tenant}>
      <PartyListScreen
        role="vendor"
        rows={rows}
        filter={filter}
        period={{ selected: periodOptions.selected, available: periodOptions.available }}
      />
    </BookOneShell>
  );
}
