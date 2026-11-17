import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantInfo } from '@/app/actions/workspace';
import { requireTenantContext } from '@bookone/auth';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button } from '@/components/ui/bookone-ui';
import { loadAgentBridgeFlags, listAgentBridgeConnections } from '@/lib/agent-bridge-runtime';
import { revokeAgentConnection } from '@/app/actions/agent-bridge';
import { jobCanWrite } from '@/lib/access';

export default async function AgentBridgeConnectionsPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }
  const flags = await loadAgentBridgeFlags(tenant.id);
  if (!flags.enabled) redirect('/purchase/purchases');
  const user = await requireTenantContext();
  const connections = await listAgentBridgeConnections(tenant.id, user.id);
  const canWrite = jobCanWrite(tenant, 'Document Inbox');

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
              Agent connections
            </span>
          </div>
          <div className="party-form-body" style={{ display: 'grid', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              New connections start with read, upload and draft. Posting still needs an explicit grant and a human
              approval in BookOne. Connected agents cannot mint approvals.
            </p>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Scopes</th>
                  <th>Status</th>
                  <th>Last use</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {connections.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No connections yet. Use the Codex or Claude setup guide to connect.</td>
                  </tr>
                ) : (
                  connections.map((c) => (
                    <tr key={c.id}>
                      <td>{c.label || c.clientId}</td>
                      <td>{c.scopes.join(', ')}</td>
                      <td>{c.revokedAt ? 'revoked' : 'active'}</td>
                      <td>{c.lastUsedAt ? c.lastUsedAt.slice(0, 16).replace('T', ' ') : '—'}</td>
                      <td>
                        {canWrite && !c.revokedAt ? (
                          <form action={revokeAgentConnection}>
                            <input type="hidden" name="connectionId" value={c.id} />
                            <Button type="submit" variant="secondary">
                              Revoke
                            </Button>
                          </form>
                        ) : null}
                      </td>
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
