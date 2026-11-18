import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button } from '@/components/ui/bookone-ui';
import { getAgentBridgeService, loadAgentBridgeFlags } from '@/lib/agent-bridge-runtime';
import { uploadInboxDocument } from '@/app/actions/agent-bridge';
import { jobCanWrite } from '@/lib/access';

export default async function DocumentInboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ err?: string; uploadSession?: string }>;
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  const flags = await loadAgentBridgeFlags(tenant.id);
  if (!flags.enabled) redirect('/purchase/purchases');
  if (tenant.accessByLabel?.['Document Inbox'] === 'none') redirect('/?denied=1');

  const { service, actor } = await getAgentBridgeService();
  const docs = await service.listInbox(actor);
  const query = await searchParams;
  const err = query?.err;
  const uploadSession = query?.uploadSession;
  const canWrite = jobCanWrite(tenant, 'Document Inbox');

  return (
    <BookOneShell active="Document Inbox" tenant={tenant}>
      <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        <div className="party-form-shell" style={{ maxHeight: 'none' }}>
          <div className="party-form-top">
            <Link href="/purchase/purchases" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back</strong>
                <small>Purchases</small>
              </span>
            </Link>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
              Unpaid service invoices
            </span>
          </div>
          <div className="party-form-body">
            {err ? (
              <p role="alert" style={{ color: 'var(--danger, #b42318)', fontWeight: 600 }}>
                {err}
              </p>
            ) : null}
            {flags.draftOnly ? (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Draft-only mode is on. Posting stays off until you change Purchase settings.</p>
            ) : null}
            {flags.postingDisabled ? (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Agent posting is stopped for this company.</p>
            ) : null}
            {canWrite ? (
              <form action={uploadInboxDocument} style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
                <div className="party-form-top" style={{ padding: 0, marginBottom: 8 }}>
                  <Link href="/purchase/inbox/connections" className="party-back-btn" style={{ marginLeft: 'auto' }}>
                    <span>
                      <strong>Connections</strong>
                      <small>Agents</small>
                    </span>
                  </Link>
                </div>
                {uploadSession ? (
                  <>
                    <input type="hidden" name="uploadSession" value={uploadSession} />
                    <p role="status">
                      A connected agent asked you to attach the original invoice here. Choose the file, then open it to enter facts.
                    </p>
                  </>
                ) : null}
                <div className="field field-full">
                  <label htmlFor="inbox-file">Upload supplier invoice (PDF or image)</label>
                  <input id="inbox-file" className="input" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
                </div>
                <div className="field field-full">
                  <label htmlFor="inbox-hint">Optional printed text from the invoice</label>
                  <textarea id="inbox-hint" className="input" name="textHint" rows={2} />
                </div>
                <Button type="submit">Receive document</Button>
              </form>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>View only. You can open documents but not upload.</p>
            )}
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {docs.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No documents yet.</td>
                  </tr>
                ) : (
                  docs.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/purchase/inbox/${d.id}`}>{d.filename}</Link>
                      </td>
                      <td>{d.status.replaceAll('_', ' ')}</td>
                      <td>{d.updatedAt.slice(0, 16).replace('T', ' ')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </BookOneShell>
  );
}
