import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button } from '@/components/ui/bookone-ui';
import { getAgentBridgeService, loadAgentBridgeFlags } from '@/lib/agent-bridge-runtime';
import {
  answerInboxIssue,
  approveInboxProposal,
  commitInboxProposal,
  previewInboxProposal,
} from '@/app/actions/agent-bridge';
import { jobCanWrite } from '@/lib/access';
import { minorToMajor } from '@bookone/agent-bridge';

export default async function InboxDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ err?: string }>;
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  const flags = await loadAgentBridgeFlags(tenant.id);
  if (!flags.enabled) redirect('/purchase/purchases');
  const { id } = await params;
  const { service, actor } = await getAgentBridgeService();
  const status = await service.getProcessingStatus(actor, id);
  const err = (await searchParams)?.err;
  const canWrite = jobCanWrite(tenant, 'Document Inbox');
  const canApprove = tenant.accessByLabel?.['Document Inbox'] === 'write' && actor.capabilities.includes('approve');
  const canPost = actor.capabilities.includes('post');
  const proposal = status.proposal;
  const preview = proposal?.preview;
  const storeApproval = proposal ? await service.getApprovalForProposal(actor, proposal.id) : null;

  return (
    <BookOneShell active="Document Inbox" tenant={tenant}>
      <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        <div className="party-form-shell" style={{ maxHeight: 'none' }}>
          <div className="party-form-top">
            <Link href="/purchase/inbox" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back</strong>
                <small>Inbox</small>
              </span>
            </Link>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
              {status.document.status.replaceAll('_', ' ')}
            </span>
          </div>
          <div className="party-form-body" style={{ display: 'grid', gap: 16 }}>
            {err ? (
              <p role="alert" style={{ color: 'var(--danger, #b42318)', fontWeight: 600 }}>
                {err}
              </p>
            ) : null}
            <section>
              <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{status.document.filename}</h2>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                Extractor {status.document.extractorId ?? 'pending'}
                {status.document.extractorLive ? ' (live)' : ' (fixture or unconfigured)'}
              </p>
            </section>
            {proposal ? (
              <section className="party-tab-grid">
                <div className="field">
                  <label>Supplier</label>
                  <div>{proposal.facts.supplierName || '—'}</div>
                </div>
                <div className="field">
                  <label>Supplier invoice</label>
                  <div>{proposal.facts.supplierInvoiceNumber || '—'}</div>
                </div>
                <div className="field">
                  <label>Date</label>
                  <div>{proposal.facts.issueDate || '—'}</div>
                </div>
                <div className="field">
                  <label>Net</label>
                  <div>{minorToMajor(proposal.facts.net).toFixed(2)} {proposal.facts.currency}</div>
                </div>
                <div className="field">
                  <label>VAT</label>
                  <div>{minorToMajor(proposal.facts.tax).toFixed(2)}</div>
                </div>
                <div className="field">
                  <label>Gross</label>
                  <div>{minorToMajor(proposal.facts.gross).toFixed(2)}</div>
                </div>
                <div className="field">
                  <label>Category</label>
                  <div>{proposal.facts.categoryLabel} ({proposal.facts.expenseAccountCode})</div>
                </div>
                <div className="field">
                  <label>Paid status</label>
                  <div>{proposal.facts.paidStatus}</div>
                </div>
              </section>
            ) : null}

            {proposal?.issues.length ? (
              <section>
                <h3 style={{ fontSize: 15 }}>Questions</h3>
                {proposal.issues.map((issue) => (
                  <form key={issue.id} action={answerInboxIssue} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                    <input type="hidden" name="proposalId" value={proposal.id} />
                    <input type="hidden" name="issueId" value={issue.id} />
                    <input type="hidden" name="documentId" value={id} />
                    <p>
                      <strong>{issue.message}</strong>
                      <br />
                      {issue.question}
                    </p>
                    {canWrite ? (
                      <>
                        {issue.allowedResolutions.includes('enter_number') ||
                        issue.allowedResolutions.includes('enter_date') ? (
                          <input className="input" name="value" required aria-label={issue.question} />
                        ) : (
                          <select className="input" name="value" defaultValue={issue.allowedResolutions[0]}>
                            {issue.allowedResolutions.map((r) => (
                              <option key={r} value={r}>
                                {r.replaceAll('_', ' ')}
                              </option>
                            ))}
                          </select>
                        )}
                        <Button type="submit">Answer</Button>
                      </>
                    ) : null}
                  </form>
                ))}
              </section>
            ) : null}

            {proposal && !proposal.issues.filter((i) => i.blocking).length ? (
              <form action={previewInboxProposal}>
                <input type="hidden" name="proposalId" value={proposal.id} />
                <input type="hidden" name="documentId" value={id} />
                <Button type="submit" variant="secondary">
                  Calculate preview
                </Button>
              </form>
            ) : null}

            {preview ? (
              <section>
                <h3 style={{ fontSize: 15 }}>Server preview</h3>
                <p>{preview.plainLanguage}</p>
                <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  Policy {preview.policyVersion} · preview {preview.previewVersion}
                </p>
                <ul>
                  {preview.journal.map((line, i) => (
                    <li key={`${line.accountCode}-${i}`}>
                      {line.side} {line.accountCode} {(line.minor / 100).toFixed(2)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {preview && canApprove ? (
              <form action={approveInboxProposal}>
                <input type="hidden" name="proposalId" value={proposal!.id} />
                <input type="hidden" name="documentId" value={id} />
                <Button type="submit">Approve this exact revision</Button>
              </form>
            ) : null}

            {storeApproval && canPost ? (
              <form action={commitInboxProposal}>
                <input type="hidden" name="proposalId" value={proposal!.id} />
                <input type="hidden" name="approvalId" value={storeApproval.id} />
                <input type="hidden" name="documentId" value={id} />
                <input type="hidden" name="idempotencyKey" value={`ui-${id}-${storeApproval.id}`} />
                <Button type="submit">Commit purchase bill once</Button>
              </form>
            ) : null}

            {status.document.status === 'posted' ? (
              <p>
                Posted. Open{' '}
                <Link href="/purchase/purchases">Purchases</Link> for the bill.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </BookOneShell>
  );
}
