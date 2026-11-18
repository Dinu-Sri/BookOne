import { redirect } from 'next/navigation';
import { getBusinessOverview } from '@/app/actions/dashboard';
import { getTenantInfo } from '@/app/actions/workspace';
import { DashboardOverview } from '@/components/dashboard/dashboard-overview';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { assertScreenAccess } from '@/lib/access';
import { Button } from '@/components/ui/bookone-ui';
import Link from 'next/link';

interface SearchParams {
  period?: string;
  compare?: string;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  await assertScreenAccess('/dashboard');

  const period = params.period;
  let overview: Awaited<ReturnType<typeof getBusinessOverview>> | null = null;
  let loadError: string | null = null;
  try {
    overview = await getBusinessOverview({ period, compare: params.compare });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load the dashboard.';
    if (/not have permission/i.test(message)) {
      redirect('/?denied=1');
    }
    loadError = message;
  }

  const selected = overview?.periodToken ?? period ?? 'mtd';

  return (
    <BookOneShell
      active="Dashboard"
      tenant={tenant}
      period={{ selected, available: overview?.availablePeriods ?? [] }}
    >
      {overview ? (
        <DashboardOverview overview={overview} />
      ) : (
        <div className="workspace dash-page">
          <p className="eyebrow">Business overview</p>
          <h1 className="h1">{tenant.name}</h1>
          <p className="dash-widget-error" role="alert">
            {loadError ?? 'Could not load dashboard figures.'} This is a report error, not a sign-in failure.
          </p>
          <Link href={`/dashboard?period=${encodeURIComponent(selected)}`}>
            <Button type="button" variant="primary">Retry</Button>
          </Link>
        </div>
      )}
    </BookOneShell>
  );
}
