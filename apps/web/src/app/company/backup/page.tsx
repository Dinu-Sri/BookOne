import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge } from '@/components/ui/bookone-ui';
import { BackupClient, FilesRestoreClient, RestoreClient } from '@/components/company/backup-client';
import { assertScreenAccess } from '@/lib/access';
import {
  getArchiveBackupStatus,
  getArchiveEmptyState,
  peekPreparedArchive,
  requireArchiveOwner,
} from '@/lib/tenant-archive';
import { withTenantContext } from '@bookone/db';

const BACKUP_LABELS: Record<string, [string, string]> = {
  parties: ['customer or supplier', 'customers and suppliers'],
  transactions: ['transaction', 'transactions'],
  journal_entries: ['journal entry', 'journal entries'],
  business_documents: ['invoice or other document', 'invoices and other documents'],
  products: ['product', 'products'],
  stock_movements: ['stock movement', 'stock movements'],
  bank_statement_imports: ['bank statement', 'bank statements'],
  bank_reconciliation_sessions: ['reconciliation', 'reconciliations'],
  pos_sales: ['till sale', 'till sales'],
};

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

  const [emptyState, prepared, backupStatus] = await withTenantContext(tenant.id, async () => {
    const empty = await getArchiveEmptyState(tenant.id);
    const peek = await peekPreparedArchive();
    const status = await getArchiveBackupStatus(tenant.id);
    return [empty, peek, status] as const;
  });

  const lastExportLabel = backupStatus.lastExportAt
    ? new Date(backupStatus.lastExportAt).toISOString().slice(0, 10)
    : null;
  const filesEnabled = Boolean(backupStatus.lastRestoreExportId) && !backupStatus.filesApplied;
  const filesReason = backupStatus.filesApplied
    ? 'Attachments already applied'
    : 'Restore company data first';

  const tradingBits = Object.entries(emptyState.counts)
    .filter(([k, n]) => n > 0 && !/_lines?$/.test(k))
    .map(([k, n]) => {
      const [one, many] = BACKUP_LABELS[k] ?? [k.replace(/_/g, ' '), k.replace(/_/g, ' ')];
      return `${n} ${n === 1 ? one : many}`;
    })
    .slice(0, 6);

  return (
    <BookOneShell active="Backup" tenant={tenant}>
      <div className="workspace ux-page set-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Backup</h1>
              <p>Download a locked copy of this company&apos;s books and files, and keep it somewhere safe.</p>
            </div>
          </div>
        </header>

        <div className="ux-split">
          <div className="ux-main set-stack">
            <section className="ux-card" aria-labelledby="backup-make-title">
              <header className="ux-card-head">
                <div>
                  <h2 id="backup-make-title">Make a backup</h2>
                  <p className="set-card-sub">
                    {emptyState.empty
                      ? 'No trading records yet. The backup still holds your settings and starter chart of accounts.'
                      : `Includes ${tradingBits.join(', ') || 'your trading records'}.`}
                  </p>
                </div>
                {backupStatus.reminderNeeded ? (
                  <Badge tone="warning">{lastExportLabel ? 'Backup due' : 'No backup yet'}</Badge>
                ) : lastExportLabel ? (
                  <Badge tone="success">Last backup {lastExportLabel}</Badge>
                ) : null}
              </header>
              <div className="ux-card-body">
                {backupStatus.reminderNeeded ? (
                  <p role="status" className="co-notice">
                    {lastExportLabel
                      ? `Your last backup was ${lastExportLabel}. Make a new one if it has been more than ${backupStatus.reminderDays} days, and keep both files off this computer.`
                      : 'Make your first backup now, and keep both files and the password together, off this computer.'}
                  </p>
                ) : null}
                <BackupClient initialMeta={prepared} />
              </div>
            </section>

            <details className="ux-disclosure" open={emptyState.empty}>
              <summary>Restore from a backup</summary>
              <div className="co-restore">
                <div className="co-restore-step">
                  <h3>1. Company data</h3>
                  <p>
                    Only a new company with no invoices, journals or stock can be restored. This replaces the starter chart
                    of accounts.
                  </p>
                  <RestoreClient restoreEnabled={emptyState.empty} />
                </div>
                <div className="co-restore-step">
                  <h3>2. Attachments</h3>
                  <p>
                    After the data is restored, upload the matching .bookone-files pack. Uploads already here are not
                    overwritten.
                    {backupStatus.missingAttachmentCount > 0
                      ? ` ${backupStatus.missingAttachmentCount} attachment${backupStatus.missingAttachmentCount === 1 ? ' is' : 's are'} missing.`
                      : ''}
                  </p>
                  <FilesRestoreClient enabled={filesEnabled} disabledReason={filesReason} />
                </div>
              </div>
            </details>
          </div>

          <aside className="ux-guide set-guide" aria-label="How backup works">
            <h2>How it works</h2>
            <ol>
              <li>
                <strong>Choose a password</strong>
                <span>BookOne does not keep it. Without it the files cannot be opened.</span>
              </li>
              <li>
                <strong>Download both files</strong>
                <span>Data holds the books and settings; Attachments holds receipts and photos. Files stay ready for 15 minutes.</span>
              </li>
              <li>
                <strong>Keep them together</strong>
                <span>Store both files and the password off this computer.</span>
              </li>
            </ol>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
