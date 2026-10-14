import { redirect } from 'next/navigation';
import { Archive } from 'lucide-react';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CompanyCard } from '../_components';
import { BackupClient, FilesRestoreClient, RestoreClient } from '@/components/company/backup-client';
import { assertScreenAccess } from '@/lib/access';
import {
  getArchiveBackupStatus,
  getArchiveEmptyState,
  peekPreparedArchive,
  requireArchiveOwner,
} from '@/lib/tenant-archive';
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

  const [emptyState, prepared, backupStatus] = await withTenantContext(tenant.id, () =>
    Promise.all([
      getArchiveEmptyState(tenant.id),
      peekPreparedArchive(),
      getArchiveBackupStatus(tenant.id),
    ]),
  );

  const lastExportLabel = backupStatus.lastExportAt
    ? new Date(backupStatus.lastExportAt).toISOString().slice(0, 10)
    : null;
  const filesEnabled = Boolean(backupStatus.lastRestoreExportId) && !backupStatus.filesApplied;
  const filesReason = backupStatus.filesApplied
    ? 'Attachments already applied'
    : 'Restore company data first';

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
              Keep both files and the password together. Restore only into a new empty company. Prepared files stay
              available to download for 15 minutes.
            </p>
            {backupStatus.reminderNeeded ? (
              <p
                role="status"
                style={{
                  color: 'var(--ink)',
                  fontSize: 13,
                  margin: '0 0 12px',
                  padding: '10px 12px',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  background: 'var(--surface-2, #f8f5ef)',
                }}
              >
                {lastExportLabel
                  ? `Last backup was ${lastExportLabel}. Create a new pair if it has been more than ${backupStatus.reminderDays} days, and keep both files off this computer.`
                  : 'No backup has been downloaded yet. Create a pair and keep both files and the password.'}
              </p>
            ) : lastExportLabel ? (
              <p style={{ color: 'var(--ink-muted)', fontSize: 13, margin: '0 0 12px' }}>
                Last backup: {lastExportLabel}.
              </p>
            ) : null}
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
              <RestoreClient restoreEnabled={emptyState.empty} />
            </div>
            <div className="field field-full" style={{ marginTop: 16 }}>
              <label>Restore attachments</label>
              <p style={{ color: 'var(--ink-muted)', fontSize: 13, margin: '6px 0 8px' }}>
                Upload the matching .bookone-files pack after company data is restored. Existing uploads are not
                overwritten.
              </p>
              {backupStatus.missingAttachmentCount > 0 ? (
                <p style={{ color: 'var(--ink-muted)', fontSize: 13, margin: '0 0 8px' }}>
                  {backupStatus.missingAttachmentCount} attachment
                  {backupStatus.missingAttachmentCount === 1 ? '' : 's'} missing. Upload the matching pack.
                </p>
              ) : null}
              <FilesRestoreClient enabled={filesEnabled} disabledReason={filesReason} />
            </div>
          </CompanyCard>
        </div>
      </div>
    </BookOneShell>
  );
}
