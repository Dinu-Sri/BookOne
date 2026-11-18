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
  retryInboxExtraction,
  submitInboxFacts,
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
  const policy = await service.getPolicyContext(actor);
  const awaitingFacts =
    status.document.status === 'awaiting_facts' ||
    status.document.status === 'failed' ||
    status.document.status === 'received';
  const canEditFacts =
    canWrite && !['posted', 'posting', 'rejected'].includes(status.document.status);
  const extractorLabel = status.document.extractorId
    ? status.document.extractorId.startsWith('agent:')
      ? 'Facts submitted by a connected agent'
      : status.document.extractorId.startsWith('human:')
        ? 'Facts entered in BookOne'
        : status.document.extractorId.startsWith('fixture:')
          ? 'Test fixture extractor'
          : status.document.extractorLive
            ? 'Configured OCR provider'
            : 'Stored original, no server OCR'
    : 'Original stored. Waiting for invoice facts.';

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
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{extractorLabel}</p>
              {status.document.lastErrorMessage ? (
                <p role="status" style={{ fontSize: 13 }}>
                  {status.document.lastErrorMessage}
                </p>
              ) : null}
              <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                Source stored · {status.document.bytes} bytes · hash {status.document.contentHash.slice(0, 12)}…
                {proposal ? ' · proposal ready' : ''}
                {status.document.status === 'posted' ? ' · posted' : ''}
              </p>
              <p>
                <Link href={`/purchase/inbox/${id}/file`}>Download original</Link>
                {' · '}
                <Link href="/company/agent-bridge">Connections</Link>
              </p>
            </section>
            {canEditFacts ? (
              <section>
                <h3 style={{ fontSize: 15 }}>{awaitingFacts ? 'Enter invoice facts' : 'Edit facts'}</h3>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {awaitingFacts
                    ? 'The original file is stored. Fill the printed amounts. Server OCR is optional.'
                    : 'Correct the printed amounts on this stored original. Saving replaces the current proposal and revokes any prior approval.'}
                </p>
                <form action={submitInboxFacts} style={{ display: 'grid', gap: 10 }}>
                  <input type="hidden" name="documentId" value={id} />
                  <input type="hidden" name="contentHash" value={status.document.contentHash} />
                  <input type="hidden" name="expectedRevision" value={String(status.document.proposalRevision)} />
                  <div className="party-tab-grid">
                    <div className="field">
                      <label htmlFor="facts-supplier">Supplier</label>
                      <input
                        id="facts-supplier"
                        className="input"
                        name="supplierName"
                        defaultValue={proposal?.facts.supplierName ?? ''}
                        list="facts-suppliers"
                        required
                      />
                      <datalist id="facts-suppliers">
                        {policy.approvedSuppliers.map((s) => (
                          <option key={s.partyId ?? s.name} value={s.name} />
                        ))}
                      </datalist>
                    </div>
                    <div className="field">
                      <label htmlFor="facts-number">Supplier invoice</label>
                      <input
                        id="facts-number"
                        className="input"
                        name="supplierInvoiceNumber"
                        defaultValue={proposal?.facts.supplierInvoiceNumber ?? ''}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="facts-date">Date</label>
                      <input
                        id="facts-date"
                        className="input"
                        name="issueDate"
                        type="date"
                        defaultValue={proposal?.facts.issueDate ?? ''}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="facts-currency">Currency</label>
                      <input
                        id="facts-currency"
                        className="input"
                        name="currency"
                        defaultValue={proposal?.facts.currency ?? policy.currency}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="facts-net">Net</label>
                      <input
                        id="facts-net"
                        className="input"
                        name="net"
                        inputMode="decimal"
                        defaultValue={proposal ? minorToMajor(proposal.facts.net).toFixed(2) : ''}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="facts-tax">VAT</label>
                      <input
                        id="facts-tax"
                        className="input"
                        name="tax"
                        inputMode="decimal"
                        defaultValue={proposal ? minorToMajor(proposal.facts.tax).toFixed(2) : ''}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="facts-gross">Gross</label>
                      <input
                        id="facts-gross"
                        className="input"
                        name="gross"
                        inputMode="decimal"
                        defaultValue={proposal ? minorToMajor(proposal.facts.gross).toFixed(2) : ''}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="facts-category">Category</label>
                      <select
                        id="facts-category"
                        className="input"
                        name="expenseAccountCode"
                        defaultValue={
                          proposal
                            ? `${proposal.facts.expenseAccountCode}|${proposal.facts.categoryLabel}`
                            : `${policy.defaultExpenseAccount}|${
                                policy.approvedCategories.find((c) => c.accountCode === policy.defaultExpenseAccount)
                                  ?.label ?? ''
                              }`
                        }
                      >
                        {policy.approvedCategories.map((c) => (
                          <option key={`${c.accountCode}|${c.label}`} value={`${c.accountCode}|${c.label}`}>
                            {c.label} ({c.accountCode})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="facts-paid">Paid status</label>
                      <select id="facts-paid" className="input" name="paidStatus" defaultValue={proposal?.facts.paidStatus ?? 'unpaid'}>
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                        <option value="part_paid">Part paid</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="facts-kind">Document kind</label>
                      <select id="facts-kind" className="input" name="documentKind" defaultValue={proposal?.facts.documentKind ?? 'service_expense'}>
                        <option value="service_expense">Service / expense</option>
                        <option value="stock">Stock</option>
                        <option value="mixed">Mixed</option>
                        <option value="unknown">Unknown</option>
                      </select>
                    </div>
                    <div className="field field-full">
                      <label htmlFor="facts-desc">Line description</label>
                      <input
                        id="facts-desc"
                        className="input"
                        name="lineDescription"
                        defaultValue={proposal?.facts.lineDescription ?? ''}
                      />
                    </div>
                  </div>
                  <Button type="submit">Save facts and continue</Button>
                </form>
                <form action={retryInboxExtraction} style={{ marginTop: 8 }}>
                  <input type="hidden" name="documentId" value={id} />
                  <Button type="submit" variant="secondary">
                    Retry optional server extraction
                  </Button>
                </form>
              </section>
            ) : null}
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

            {storeApproval ? (
              <p data-testid="inbox-approver">
                Approved by {storeApproval.actorUserId}
                {storeApproval.revokedAt ? ' (revoked after a later edit)' : ''}. Expires {storeApproval.expiresAt}.
              </p>
            ) : null}

            {storeApproval && canPost && !storeApproval.revokedAt ? (
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
