import { redirect } from 'next/navigation';
import { Archive } from 'lucide-react';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CompanyCard } from '../_components';
import { BackupClient } from '@/components/company/backup-client';
import { assertScreenAccess } from '@/lib/access';
import { getArchiveEmptyState, peekPreparedArchive, requireArchiveOwner } from '@/lib/tenant-archive';
import { withTenantContext } from '@bookone/db';

export default async function CompanyBackupPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  await assertScreenAccess('/company/backup', 'read');
  try {
    await requireArchiveOwner();
  } catch {
    redirect('/?denied=1');
  }

  const [emptyState, prepared] = await withTenantContext(tenant.id, () =>
    Promise.all([getArchiveEmptyState(tenant.id), peekPreparedArchive()]),
  );

  const tradingBits = Object.entries(emptyState.counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k.replace(/_/g, ' ')} ${n}`)
    .slice(0, 8);

  return (
    <BookOneShell active="Backup" tenant={tenant}>
      <div className="workspace">
        <div className="grid two" style={{ alignItems: 'start' }}>
          <CompanyCard
            title="Company backup"
            subtitle="Download two encrypted files for this company. BookOne does not store the password."
            action={<Archive size={18} color="var(--brand)" />}
          >
            <p style={{ color: 'var(--ink-muted)', fontSize: 13, marginTop: 0 }}>
              Data holds the books (invoices, journals, stock, settings). Attachments holds receipts and photos.
              Keep both files and the password together. Restore into a new empty company comes in a later
              release.
            </p>
            <BackupClient initialMeta={prepared} />
          </CompanyCard>

          <CompanyCard title="This company" subtitle="Signup seed (chart of accounts, jobs) is not trading history.">
            {emptyState.empty ? (
              <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                No invoices, journals, parties, or stock yet. You can still download a backup of settings and the
                starter chart.
              </p>
            ) : (
              <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                Trading records in this backup: {tradingBits.join(', ') || 'yes'}.
              </p>
            )}
            <div className="field field-full" style={{ marginTop: 16 }}>
              <label>Restore into this company</label>
              <p style={{ color: 'var(--ink-muted)', fontSize: 13, margin: '6px 0 8px' }}>
                Only a new company with no invoices, journals, or stock can be restored. This replaces the starter
                chart of accounts.
              </p>
              <button type="button" className="btn-secondary" disabled>
                Restore (coming later)
              </button>
            </div>
          </CompanyCard>
        </div>
      </div>
    </BookOneShell>
  );
}
