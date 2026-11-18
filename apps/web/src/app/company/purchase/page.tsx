import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPurchaseSettings, savePurchaseSettingsFromForm } from '@/app/actions/purchase-settings';
import { getDocumentFormOptions } from '@/app/actions/documents';
import { getTenantInfo } from '@/app/actions/workspace';
import { loadAgentBridgeFlags } from '@/lib/agent-bridge-runtime';
import { saveAgentBridgeSettingsFromForm } from '@/app/actions/agent-bridge';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button } from '@/components/ui/bookone-ui';

export default async function CompanyPurchaseSettingsPage() {
  let tenant;
  let settings;
  let options;
  let abFlags = { enabled: false, draftOnly: true, postingDisabled: true };
  try {
    [tenant, settings, options] = await Promise.all([
      getTenantInfo(),
      getPurchaseSettings(),
      getDocumentFormOptions(),
    ]);
    abFlags = await loadAgentBridgeFlags(tenant.id);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Purchase Settings" tenant={tenant}>
      <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        <div className="party-form-shell" style={{ maxHeight: 'none', minHeight: 0 }}>
          <div className="party-form-top">
            <Link href="/company/details" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back</strong>
                <small>Company</small>
              </span>
            </Link>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
              Purchase / AP controls
            </span>
          </div>
          <form action={savePurchaseSettingsFromForm} className="party-form-body">
            <div className="party-tab-panel">
              <div className="party-tab-grid">
                <div className="field field-full">
                  <label className="party-check">
                    <input
                      type="checkbox"
                      name="requireBillApproval"
                      value="on"
                      defaultChecked={settings.requireBillApproval}
                    />
                    Require approval before purchase bills post to GL / stock
                  </label>
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                    Bills save as <strong>pending approval</strong>. Use Approve on the bill detail to post AP.
                  </p>
                </div>
                <div className="field field-full">
                  <label className="party-check">
                    <input
                      type="checkbox"
                      name="requireSupplierInvoiceNo"
                      value="on"
                      defaultChecked={settings.requireSupplierInvoiceNo}
                    />
                    Require supplier invoice number on credit bills
                  </label>
                </div>
                <div className="field field-full">
                  <label className="party-check">
                    <input
                      type="checkbox"
                      name="blockDuplicateBills"
                      value="on"
                      defaultChecked={settings.blockDuplicateBills}
                    />
                    Block duplicate bills (same vendor + supplier invoice #)
                  </label>
                </div>
                <div className="field field-full">
                  <label className="party-check">
                    <input
                      type="checkbox"
                      name="requireGrnBeforeBill"
                      value="on"
                      defaultChecked={settings.requireGrnBeforeBill}
                    />
                    Require goods receipt (GRN) before billing a purchase order with products
                  </label>
                </div>
                <div className="field field-full">
                  <label className="party-check">
                    <input
                      type="checkbox"
                      name="postGrniOnReceipt"
                      value="on"
                      defaultChecked={settings.postGrniOnReceipt}
                    />
                    Post GRNI on goods receipt (Dr Inventory 5100 / Cr GRNI 2150)
                  </label>
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                    When on, GRNs capitalise inventory early. Vendor bills for already-received goods
                    clear liability 2150 instead of debiting inventory again. Leave off for qty-only
                    GRNs (default).
                  </p>
                </div>
                <div className="field">
                  <label>Default payment terms</label>
                  <select
                    className="input"
                    name="defaultPaymentTerms"
                    defaultValue={settings.defaultPaymentTerms}
                  >
                    <option value="Due on receipt">Due on receipt</option>
                    <option value="Net 7">Net 7</option>
                    <option value="Net 15">Net 15</option>
                    <option value="Net 30">Net 30</option>
                    <option value="Net 45">Net 45</option>
                    <option value="Net 60">Net 60</option>
                  </select>
                </div>
                <div className="field">
                  <label>Default expense account</label>
                  <select
                    className="input"
                    name="defaultExpenseAccount"
                    defaultValue={settings.defaultExpenseAccount}
                  >
                    {(options.expenseAccounts.length
                      ? options.expenseAccounts
                      : [{ code: '6800', name: 'General Expense' }]
                    ).map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="party-form-footer">
              <Button variant="primary" type="submit">
                Save purchase settings
              </Button>
            </div>
          </form>
          <form action={saveAgentBridgeSettingsFromForm} className="party-form-body" style={{ borderTop: '1px solid var(--line, #e5e7eb)', marginTop: 16 }}>
            <div className="party-tab-panel">
              <div className="party-tab-grid">
                <div className="field field-full">
                  <strong>Document Inbox (AgentBridge)</strong>
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                    Off by default. Draft-only and posting-disable stay on until you turn them off. No autonomous posting.
                  </p>
                  <p style={{ fontSize: 12, marginTop: 8 }}>
                    <Link href="/purchase/inbox/connections">Connect Codex or Claude</Link>
                    {' — copy the public MCP and client details from BookOne.'}
                  </p>
                </div>
                <div className="field field-full">
                  <label className="party-check">
                    <input type="checkbox" name="agentBridgeEnabled" value="on" defaultChecked={abFlags.enabled} />
                    Enable Document Inbox for this company
                  </label>
                </div>
                <div className="field field-full">
                  <label className="party-check">
                    <input type="checkbox" name="agentBridgeDraftOnly" value="on" defaultChecked={abFlags.draftOnly} />
                    Draft-only (agents cannot post)
                  </label>
                </div>
                <div className="field field-full">
                  <label className="party-check">
                    <input
                      type="checkbox"
                      name="agentBridgePostingDisabled"
                      value="on"
                      defaultChecked={abFlags.postingDisabled}
                    />
                    Stop AgentBridge posting (server-side)
                  </label>
                </div>
              </div>
            </div>
            <div className="party-form-footer">
              <Button variant="secondary" type="submit">
                Save Document Inbox flags
              </Button>
            </div>
          </form>
        </div>
      </div>
    </BookOneShell>
  );
}
