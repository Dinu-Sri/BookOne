import { redirect } from 'next/navigation';
import { getPosBootstrap } from '@/app/actions/pos-session';
import { PosTerminal } from '@/components/pos/pos-terminal';

export default async function PosPage() {
  let bootstrap;
  try {
    bootstrap = await getPosBootstrap();
  } catch {
    redirect('/login');
  }

  return <PosTerminal bootstrap={bootstrap} />;
}
