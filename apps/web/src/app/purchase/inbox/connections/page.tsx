import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantInfo } from '@/app/actions/workspace';
import { requireTenantContext } from '@bookone/auth';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button } from '@/components/ui/bookone-ui';
import { loadAgentBridgeFlags, listAgentBridgeConnections } from '@/lib/agent-bridge-runtime';
import { revokeAgentConnection } from '@/app/actions/agent-bridge';
import { jobCanWrite } from '@/lib/access';
import { AgentBridgeConnectionSetup } from '@/components/agent-bridge/connection-setup';
import {
  ensureOauthSigningPem,
  publicConnectionDetails,
  publicOrigin,
} from '@bookone/agent-bridge';

export default async function AgentBridgeConnectionsPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/purchase/inbox/connections');
  }
  const flags = await loadAgentBridgeFlags(tenant.id);
  const user = await requireTenantContext();
  const connections = flags.enabled ? await listAgentBridgeConnections(tenant.id, user.id) : [];
  const canWrite = jobCanWrite(tenant, 'Document Inbox');
  const signingReady = Boolean(ensureOauthSigningPem(process.env));
  const origin = publicOrigin(process.env);
  const details = publicConnectionDetails(origin || 'https://bookone.clossyan.com', signingReady);

  return (
    <BookOneShell active="Document Inbox" tenant={tenant}>
      <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        <div className="party-form-shell" style={{ maxHeight: 'none' }}>
          <div className="party-form-top">
            <Link href={flags.enabled ? '/purchase/inbox' : '/company/purchase'} className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back</strong>
                <small>{flags.enabled ? 'Inbox' : 'Purchase settings'}</small>
              </span>
            </Link>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
              Agent connections
            </span>
          </div>
          <div className="party-form-body" style={{ display: 'grid', gap: 12 }}>
            <AgentBridgeConnectionSetup details={details} inboxEnabled={flags.enabled} />
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
                    <td colSpan={5}>
                      No connections yet. Copy the Codex or Claude details above, then allow the client when BookOne
                      asks.
                    </td>
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
