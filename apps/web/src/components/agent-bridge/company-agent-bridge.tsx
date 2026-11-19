'use client';

import { useMemo, useState } from 'react';
import { revokeAgentConnection, saveAgentBridgeSettingsFromForm } from '@/app/actions/agent-bridge';
import { Button } from '@/components/ui/bookone-ui';

export type AgentBridgePromptCard = {
  client: 'codex' | 'claude';
  clientId: string;
  title: string;
  surface: string;
  prompt: string;
};

export type AgentBridgeReadinessItem = {
  id: 'server' | 'company' | 'clients';
  label: string;
  level: 'ready' | 'setup_needed' | 'unavailable';
  detail: string;
};

export type AgentBridgeFlagsView = {
  enabled: boolean;
  draftOnly: boolean;
  postingDisabled: boolean;
};

export type AgentBridgeClientRow = {
  id: string;
  label: string;
  companyName: string;
  scopes: string;
  status: string;
  lastUsed: string;
  created: string;
  lastOauth?: string | null;
  canRevoke: boolean;
};

export type AgentBridgeTechnicalDetails = {
  publicUrl: string;
  issuer: string;
  mcpUrl: string;
  jwksUrl: string;
  authorizationUrl: string;
  codexClientId: string;
  claudeClientId: string;
};

export type CompanyAgentBridgeProps = {
  companyName: string;
  checkedAt: string;
  canWriteSettings: boolean;
  flags: AgentBridgeFlagsView;
  effectiveExplanation: string;
  saved: boolean;
  saveError: string | null;
  promptError: string | null;
  readiness: AgentBridgeReadinessItem[];
  prompts: AgentBridgePromptCard[];
  connections: AgentBridgeClientRow[];
  technical: AgentBridgeTechnicalDetails;
};

function levelLabel(level: AgentBridgeReadinessItem['level']) {
  if (level === 'ready') return 'Ready';
  if (level === 'setup_needed') return 'Setup needed';
  return 'Unavailable';
}

function CopyPromptButton({ value, name }: { value: string; name: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      const field = document.querySelector<HTMLTextAreaElement>(`[data-ab-prompt="${CSS.escape(name)}"]`);
      if (field) {
        field.focus();
        field.select();
        const ok = document.execCommand('copy');
        setStatus(ok ? 'copied' : 'error');
      } else {
        setStatus('error');
      }
    }
    window.setTimeout(() => setStatus('idle'), 2400);
  }
  return (
    <div>
      <Button type="button" variant="primary" onClick={copy} aria-label={`Copy ${name} connection prompt`}>
        {status === 'copied' ? 'Copied' : 'Copy connection prompt'}
      </Button>
      <p className="ab-copy-live" role="status" aria-live="polite">
        {status === 'copied'
          ? `${name} prompt copied. Paste it into the assistant, then sign in and Allow in BookOne.`
          : status === 'error'
            ? 'Copy failed. Select the prompt and copy it yourself.'
            : ''}
      </p>
    </div>
  );
}

function SettingsForm({
  flags,
  canWrite,
  saved,
  saveError,
  effectiveExplanation,
}: {
  flags: AgentBridgeFlagsView;
  canWrite: boolean;
  saved: boolean;
  saveError: string | null;
  effectiveExplanation: string;
}) {
  const [enabled, setEnabled] = useState(flags.enabled);
  const [draftOnly, setDraftOnly] = useState(flags.draftOnly);
  const [postingDisabled, setPostingDisabled] = useState(flags.postingDisabled);
  const dirty = enabled !== flags.enabled || draftOnly !== flags.draftOnly || postingDisabled !== flags.postingDisabled;
  const liveExplanation = useMemo(() => {
    if (!enabled) {
      return 'Document Inbox is off, so agents cannot finish consent or upload. Draft-only and posting-stop still apply if you turn Inbox on.';
    }
    if (postingDisabled) {
      return draftOnly
        ? 'Inbox is on. Agents may prepare drafts only. Server-side posting is stopped even after a human approval until you change that.'
        : 'Inbox is on. Server-side posting is stopped even after a human approval until you change that.';
    }
    if (draftOnly) {
      return 'Inbox is on. Agents may prepare drafts. Posting still needs an explicit grant and a human approval in BookOne.';
    }
    return 'Inbox is on. Draft-only and posting-stop are off. Agents still cannot mint approvals. Posting needs an explicit grant and a human approval in BookOne.';
  }, [enabled, draftOnly, postingDisabled]);

  if (!canWrite) {
    return (
      <section className="ab-panel" aria-labelledby="ab-settings-title">
        <h2 id="ab-settings-title">Company settings</h2>
        <p className="ab-connect-lead">{effectiveExplanation}</p>
        <p className="ab-connect-status" role="status">
          You can view these settings. Changing them needs company purchase-settings write access.
        </p>
        <ul className="ab-readonly-flags">
          <li>Document Inbox enabled: {flags.enabled ? 'On' : 'Off'}</li>
          <li>Draft-only: {flags.draftOnly ? 'On' : 'Off'}</li>
          <li>Stop AgentBridge posting: {flags.postingDisabled ? 'On' : 'Off'}</li>
        </ul>
      </section>
    );
  }

  return (
    <section className="ab-panel" aria-labelledby="ab-settings-title">
      <h2 id="ab-settings-title">Company settings</h2>
      <form action={saveAgentBridgeSettingsFromForm} className="ab-settings-form">
        <label className="party-check">
          <input
            type="checkbox"
            name="agentBridgeEnabled"
            value="on"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Document Inbox enabled
        </label>
        <label className="party-check">
          <input
            type="checkbox"
            name="agentBridgeDraftOnly"
            value="on"
            checked={draftOnly}
            onChange={(e) => setDraftOnly(e.target.checked)}
          />
          Draft-only
        </label>
        <label className="party-check">
          <input
            type="checkbox"
            name="agentBridgePostingDisabled"
            value="on"
            checked={postingDisabled}
            onChange={(e) => setPostingDisabled(e.target.checked)}
          />
          Stop AgentBridge posting
        </label>
        <p className="ab-connect-lead">{liveExplanation}</p>
        {dirty ? (
          <p className="ab-connect-status" role="status">
            You have unsaved AgentBridge settings.
          </p>
        ) : null}
        {saved && !dirty ? (
          <p className="ab-connect-status is-ready" role="status">
            AgentBridge settings saved.
          </p>
        ) : null}
        {saveError ? (
          <p className="ab-connect-status is-blocked" role="alert">
            {saveError}
          </p>
        ) : null}
        <div className="party-form-footer" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <Button variant="primary" type="submit">
            Save AgentBridge settings
          </Button>
        </div>
      </form>
    </section>
  );
}

function RevokeAccess({ connectionId, label }: { connectionId: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
        Revoke access
      </Button>
    );
  }
  return (
    <form action={revokeAgentConnection} className="ab-revoke">
      <input type="hidden" name="connectionId" value={connectionId} />
      <p className="ab-connect-status is-blocked" role="status">
        Revoke {label}? This immediately ends its access.
      </p>
      <Button type="submit" variant="secondary">
        Confirm revoke
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </form>
  );
}

export function CompanyAgentBridge({
  companyName,
  checkedAt,
  canWriteSettings,
  flags,
  effectiveExplanation,
  saved,
  saveError,
  promptError,
  readiness,
  prompts,
  connections,
  technical,
}: CompanyAgentBridgeProps) {
  return (
    <div className="workspace party-workspace ab-company-page" style={{ display: 'grid', gap: 14 }}>
      <div className="party-form-shell" style={{ maxHeight: 'none' }}>
        <div className="party-form-body" style={{ display: 'grid', gap: 18 }}>
          <header className="ab-page-head">
            <h1 className="ab-page-title">AgentBridge</h1>
            <p className="ab-connect-lead">
              Connect an AI assistant to help prepare and review business entries under BookOne&apos;s rules and
              permissions.
            </p>
          </header>

          <section className="ab-panel" aria-labelledby="ab-status-title">
            <h2 id="ab-status-title">Status</h2>
            <p className="ab-checked-at">Checked {checkedAt}</p>
            <ul className="ab-status-list">
              {readiness.map((item) => (
                <li key={item.id} className={`ab-status-item is-${item.level}`}>
                  <div className="ab-status-row">
                    <strong>{item.label}</strong>
                    <span className="ab-status-pill">{levelLabel(item.level)}</span>
                  </div>
                  <p>{item.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          <SettingsForm
            flags={flags}
            canWrite={canWriteSettings}
            saved={saved}
            saveError={saveError}
            effectiveExplanation={effectiveExplanation}
          />

          <section className="ab-panel" aria-labelledby="ab-connect-title">
            <h2 id="ab-connect-title">Connect your assistant</h2>
            <p className="ab-connect-lead">
              Copy one prompt, paste it into that assistant, then sign in and Allow in BookOne. Copying does not create
              a connection. The prompt cannot finish consent for you.
            </p>
            {promptError ? (
              <p className="ab-connect-status is-blocked" role="alert">
                {promptError}
              </p>
            ) : (
              <div className="ab-prompt-grid">
                {prompts.map((card) => (
                  <article key={card.client} className="ab-prompt-card" aria-labelledby={`ab-prompt-${card.client}`}>
                    <h3 id={`ab-prompt-${card.client}`}>{card.title}</h3>
                    <p className="ab-prompt-surface">{card.surface}</p>
                    <label className="ab-sr-only" htmlFor={`ab-prompt-text-${card.client}`}>
                      {card.title} prompt
                    </label>
                    <textarea
                      id={`ab-prompt-text-${card.client}`}
                      className="input ab-prompt-preview"
                      readOnly
                      rows={12}
                      value={card.prompt}
                      data-ab-prompt={card.title}
                      aria-label={`${card.title} prompt`}
                    />
                    <CopyPromptButton value={card.prompt} name={card.title} />
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="ab-panel" aria-labelledby="ab-clients-title">
            <h2 id="ab-clients-title">Connected clients</h2>
            <div className="ab-clients-table">
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Company</th>
                  <th>Allowed</th>
                  <th>Status</th>
                  <th>Last use</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {connections.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      No authenticated clients yet. Copying a connection prompt does not itself connect anything. After
                      you paste it into Codex or Claude, sign in and Allow in BookOne. Then the client appears here.
                    </td>
                  </tr>
                ) : (
                  connections.map((row) => (
                    <tr key={row.id}>
                      <td>{row.label}</td>
                      <td>{row.companyName}</td>
                      <td>{row.scopes}</td>
                      <td>
                        <div>{row.status}</div>
                        {row.lastOauth ? <p className="ab-oauth-diag">{row.lastOauth}</p> : null}
                      </td>
                      <td>{row.lastUsed}</td>
                      <td>{row.created}</td>
                      <td>{row.canRevoke ? <RevokeAccess connectionId={row.id} label={row.label} /> : null}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
            <p className="ab-connect-lead">
              Reconnect with the same two prompts above. Bound to {companyName}.
            </p>
          </section>

          <details className="ab-tech">
            <summary>Technical details</summary>
            <dl className="ab-tech-list">
              <div>
                <dt>Public URL</dt>
                <dd>{technical.publicUrl}</dd>
              </div>
              <div>
                <dt>Issuer</dt>
                <dd>{technical.issuer}</dd>
              </div>
              <div>
                <dt>MCP URL</dt>
                <dd>{technical.mcpUrl}</dd>
              </div>
              <div>
                <dt>JWKS URL</dt>
                <dd>{technical.jwksUrl}</dd>
              </div>
              <div>
                <dt>Authorization URL</dt>
                <dd>{technical.authorizationUrl}</dd>
              </div>
              <div>
                <dt>Codex client ID</dt>
                <dd>{technical.codexClientId}</dd>
              </div>
              <div>
                <dt>Claude client ID</dt>
                <dd>{technical.claudeClientId}</dd>
              </div>
            </dl>
          </details>
        </div>
      </div>
    </div>
  );
}
