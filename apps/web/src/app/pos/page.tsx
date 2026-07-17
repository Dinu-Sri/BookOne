import { redirect } from 'next/navigation';
import { getPosBootstrap, listRecentPosSales } from '@/app/actions/pos-session';
import { PosTerminal } from '@/components/pos/pos-terminal';

export default async function PosPage() {
  let bootstrap;
  let recentSales;
  try {
    [bootstrap, recentSales] = await Promise.all([getPosBootstrap(), listRecentPosSales(25)]);
  } catch {
    redirect('/login');
  }

  return <PosTerminal bootstrap={bootstrap} recentSales={recentSales} />;
}
