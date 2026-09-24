import { cookies } from 'next/headers';
import { listOpsLogs } from '@/lib/ops-log';
import { OPS_LOG_COOKIE, opsCookieOk, opsLogSecret } from '@/lib/ops-auth';
import { OpsLogGate, OpsLogTable } from './ui';

export const dynamic = 'force-dynamic';

export default async function OpsLogsPage() {
  const secret = opsLogSecret();
  if (!secret) {
    return (
      <main className="ops-log-page">
        <h1>Ops log</h1>
        <p>OPS_LOG_SECRET is not set on this server.</p>
      </main>
    );
  }
  const jar = await cookies();
  const authed = opsCookieOk(jar.get(OPS_LOG_COOKIE)?.value, secret);
  if (!authed) {
    return (
      <main className="ops-log-page">
        <OpsLogGate />
      </main>
    );
  }
  let rows: Awaited<ReturnType<typeof listOpsLogs>> = [];
  let error = '';
  try {
    rows = await listOpsLogs(250);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not read logs (run migration 039).';
  }
  return (
    <main className="ops-log-page">
      <OpsLogTable rows={rows} error={error} />
    </main>
  );
}
