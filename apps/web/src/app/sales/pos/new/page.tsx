import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button } from '@/components/ui/bookone-ui';

/** Office fallback — prefer full-screen /pos terminal */
export default async function NewPosSalePage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="POS History" tenant={tenant}>
      <div className="workspace party-workspace" style={{ padding: 28 }}>
        <h3 style={{ margin: '0 0 8px' }}>POS terminal</h3>
        <p style={{ color: 'var(--ink-muted)', marginBottom: 16 }}>
          Use the full-screen POS for fast checkout (scan, tenders, drawer, customer display).
        </p>
        <Link href="/pos">
          <Button variant="primary" type="button">
            Open POS terminal
          </Button>
        </Link>
      </div>
    </BookOneShell>
  );
}
