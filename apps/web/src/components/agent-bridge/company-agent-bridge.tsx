'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bot, Check, Copy } from 'lucide-react';
import {
  revokeAgentConnection,
  saveAgentBridgeSettingsFromForm,
  setAgentBridgeAbilitiesFromForm,
} from '@/app/actions/agent-bridge';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withFormPending } from '@/components/ui/form-busy';

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
  abilities?: { commerceMapping: boolean; printDesign: boolean };
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
  /** Which optional abilities the signed-in person may give an assistant. */
  canGrant?: { commerceMapping: boolean; printDesign: boolean };
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

function statusTone(status: string): 'success' | 'warning' | 'neutral' | 'info' {
  if (status === 'Active') return 'success';
  if (status === 'Revoked') return 'neutral';
  if (status === 'Token issued' || status === 'Permission granted') return 'warning';
  return 'info';
}

/** Plain name for a connection status (the lifecycle labels stay the stored truth). */
function statusWords(status: string): string {
  if (status === 'Active') return 'Connected';
  if (status === 'Token issued') return 'Signed in, not used yet';
  if (status === 'Permission granted') return 'Waiting for sign-in to finish';
  return status;
}

function CopyPromptButton({ value, name, primary }: { value: string; name: string; primary: boolean }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      const field = document.querySelector<HTMLTextAreaElement>(`[data-ab-prompt="${CSS.escape(name)}"]`);
      if (field) {
        const details = field.closest('details');
        if (details) details.open = true;
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
    <>
      <Button type="button" variant={primary ? 'primary' : 'secondary'} onClick={copy} aria-label={`Copy ${name} connection prompt`}>
        {status === 'copied' ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
        {status === 'copied' ? 'Copied' : 'Copy connection prompt'}
      </Button>
      <p className="ab-copy-live" role="status" aria-live="polite">
        {status === 'copied'
          ? `Copied. Paste it into ${name.replace('Connect with ', '')}, then sign in and press Allow.`
          : status === 'error'
            ? 'Copy failed. Open "Show prompt" and copy it yourself.'
            : ''}
      </p>
    </>
  );
}

function Switch({
  name,
  checked,
  onChange,
  label,
  disabled,
}: {
  name: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="ux-switch">
      <input
        type="checkbox"
        role="switch"
        name={name}
        value="on"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        aria-label={label}
      />
      <span aria-hidden />
    </label>
  );
}

const SETTING_ROWS: Array<{ key: keyof AgentBridgeFlagsView; name: string; title: string; text: string }> = [
  {
    key: 'enabled',
    name: 'agentBridgeEnabled',
    title: 'Allow AI assistants for this company',
    text: 'Assistants can sign in and work here. Turn this off to stop every assistant at once.',
  },
  {
    key: 'draftOnly',
    name: 'agentBridgeDraftOnly',
    title: 'Supplier bills: drafts only',
    text: 'Assistants can read bills and fill in drafts, but cannot ask for a bill to be posted.',
  },
  {
    key: 'postingDisabled',
    name: 'agentBridgePostingDisabled',
    title: 'Never post supplier bills from AgentBridge',
    text: 'Even after you approve a bill here, it is not posted through AgentBridge.',
  },
];

function SettingsCard({
  flags,
  canWrite,
  saved,
  saveError,
}: {
  flags: AgentBridgeFlagsView;
  canWrite: boolean;
  saved: boolean;
  saveError: string | null;
}) {
  const [values, setValues] = useState<AgentBridgeFlagsView>(flags);
  const dirty =
    values.enabled !== flags.enabled || values.draftOnly !== flags.draftOnly || values.postingDisabled !== flags.postingDisabled;

  return (
    <section className="ux-card" aria-labelledby="ab-settings-title">
      <form action={saveAgentBridgeSettingsFromForm}>
        <header className="ux-card-head">
          <h2 id="ab-settings-title">What assistants may do here</h2>
          {canWrite ? (
            <Button variant={dirty ? 'primary' : 'secondary'} type="submit">
              Save AgentBridge settings
            </Button>
          ) : (
            <span>View only</span>
          )}
        </header>
        <div className="ux-rows">
          {SETTING_ROWS.map((row) => (
            <div className="ux-row" key={row.key}>
              <div className="ux-row-text">
                <strong>{row.title}</strong>
                <span>{row.text}</span>
              </div>
              <div className="ux-row-side">
                {canWrite ? (
                  <Switch
                    name={row.name}
                    label={row.title}
                    checked={values[row.key]}
                    onChange={(v) => setValues((prev) => ({ ...prev, [row.key]: v }))}
                  />
                ) : (
                  <Badge tone={flags[row.key] ? 'success' : 'neutral'}>{flags[row.key] ? 'On' : 'Off'}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
        {dirty || (saved && !dirty) || saveError || !canWrite ? (
          <p
            className={`ab-settings-note${saveError ? ' is-error' : saved && !dirty ? ' is-ok' : ''}`}
            role={saveError ? 'alert' : 'status'}
          >
            {saveError
              ? saveError
              : dirty
                ? 'You have unsaved changes.'
                : saved
                  ? 'AgentBridge settings saved.'
                  : 'Changing these needs the Purchase Settings write permission.'}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function AbilitiesForm({
  row,
  canGrant,
  onDone,
}: {
  row: AgentBridgeClientRow;
  canGrant: { commerceMapping: boolean; printDesign: boolean };
  onDone: () => void;
}) {
  const [mapping, setMapping] = useState(row.abilities?.commerceMapping ?? false);
  const [design, setDesign] = useState(row.abilities?.printDesign ?? false);
  return (
    <form action={setAgentBridgeAbilitiesFromForm} className="ab-abilities">
      <input type="hidden" name="connectionId" value={row.id} />
      <div className="ux-row">
        <div className="ux-row-text">
          <strong>Supplier bills</strong>
          <span>Read bills you upload and prepare drafts. Always on while connected.</span>
        </div>
        <Badge tone="success">On</Badge>
      </div>
      <div className="ux-row">
        <div className="ux-row-text">
          <strong>Website product mapping</strong>
          <span>Suggest which website products match BookOne products. You apply them in Commerce.</span>
        </div>
        <Switch
          name="commerceMapping"
          label="Website product mapping"
          checked={mapping}
          onChange={setMapping}
          disabled={!canGrant.commerceMapping}
        />
      </div>
      <div className="ux-row">
        <div className="ux-row-text">
          <strong>Print designs</strong>
          <span>Design invoices, quotations and other print items, and save new versions. You approve before one is used. It can never delete a design.</span>
        </div>
        <Switch
          name="printDesign"
          label="Print designs"
          checked={design}
          onChange={setDesign}
          disabled={!canGrant.printDesign}
        />
      </div>
      <div className="ab-abilities-foot">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save abilities
        </Button>
      </div>
    </form>
  );
}

function abilityWords(row: AgentBridgeClientRow): string {
  const out = ['Supplier bills'];
  if (row.abilities?.commerceMapping) out.push('website product mapping');
  if (row.abilities?.printDesign) out.push('print designs');
  return out.join(', ');
}

function ConnectionRow({
  row,
  canGrant,
}: {
  row: AgentBridgeClientRow;
  canGrant: { commerceMapping: boolean; printDesign: boolean };
}) {
  const [editing, setEditing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [busy, setBusy] = useState(false);
  const mayEdit = row.canRevoke && (canGrant.commerceMapping || canGrant.printDesign);

  async function doRevoke() {
    setBusy(true);
    const fd = new FormData();
    fd.set('connectionId', row.id);
    try {
      await withFormPending(() => revokeAgentConnection(fd));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="ab-conn">
      <div className="ab-conn-main">
        <span className="ab-conn-icon" aria-hidden>
          <Bot size={18} />
        </span>
        <div className="ab-conn-text">
          <div className="ab-conn-title">
            <strong>{row.label}</strong>
            <Badge tone={statusTone(row.status)}>{statusWords(row.status)}</Badge>
          </div>
          <span>
            Can do: {abilityWords(row)} · Last used {row.lastUsed} · Added {row.created}
          </span>
          {row.lastOauth && row.status !== 'Active' ? <span className="ab-conn-diag">{row.lastOauth}</span> : null}
        </div>
        <div className="ab-conn-actions">
          {mayEdit && !editing ? (
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              Change abilities
            </Button>
          ) : null}
          {row.canRevoke ? (
            <Button type="button" variant="ghost" onClick={() => setRevoking(true)}>
              Revoke access
            </Button>
          ) : null}
        </div>
      </div>
      {editing ? <AbilitiesForm row={row} canGrant={canGrant} onDone={() => setEditing(false)} /> : null}
      <ConfirmDialog
        open={revoking}
        title={`Revoke ${row.label}?`}
        message={`${row.label} loses access to ${row.companyName} straight away. Its drafts and designs stay. To use it again, connect it again.`}
        confirmLabel="Confirm revoke"
        tone="danger"
        busy={busy}
        onCancel={() => setRevoking(false)}
        onConfirm={doRevoke}
      />
    </li>
  );
}

export function CompanyAgentBridge({
  companyName,
  checkedAt,
  canWriteSettings,
  canGrant = { commerceMapping: false, printDesign: false },
  flags,
  saved,
  saveError,
  promptError,
  readiness,
  prompts,
  connections,
  technical,
}: CompanyAgentBridgeProps) {
  const server = readiness.find((r) => r.id === 'server');
  const active = connections.filter((c) => c.status === 'Active');
  const pending = connections.filter((c) => c.status === 'Token issued' || c.status === 'Permission granted');
  const live = connections.filter((c) => c.status !== 'Revoked');

  const next = useMemo(() => {
    if (server && server.level !== 'ready') {
      return {
        tone: 'is-warn',
        title: 'Assistants cannot connect yet.',
        text: server.detail,
      };
    }
    if (!flags.enabled) {
      return {
        tone: 'is-warn',
        title: 'AI assistants are off for this company.',
        text: 'Turn on "Allow AI assistants for this company", save, then connect Claude or Codex.',
      };
    }
    if (active.length > 0) {
      return {
        tone: 'is-ok',
        title: `${active.length} assistant${active.length === 1 ? '' : 's'} connected to ${companyName}.`,
        text: 'Ask it in chat to read a supplier bill or design a print item. You approve the result here in BookOne.',
      };
    }
    if (pending.length > 0) {
      return {
        tone: '',
        title: 'Sign-in started but not finished.',
        text: 'Go back to your assistant and finish signing in. If it keeps failing, copy the prompt again.',
      };
    }
    return {
      tone: '',
      title: 'Ready to connect.',
      text: 'Copy the prompt for your assistant below and paste it into a new chat.',
    };
  }, [server, flags.enabled, active.length, pending.length, companyName]);

  return (
    <div className="workspace ux-page ab-v2 ab-company-page">
      <header className="ux-head">
        <div className="ux-head-text">
          <div>
            <h1 className="page-title ab-page-title">AgentBridge</h1>
            <p>
              Let an AI assistant such as Claude or Codex do routine work in {companyName}. It prepares the work; you
              approve it.
            </p>
          </div>
        </div>
        <div className="ux-head-actions">
          <a className="ab-quiet-link" href="/docs/developers/agentbridge" target="_blank" rel="noopener noreferrer">
            AgentBridge guide
          </a>
        </div>
      </header>

      <div className="ux-split">
        <div className="ux-main">
          <section className="ux-next" aria-label="Status">
            <div className={`ux-next-row ${next.tone}`}>
              <div>
                <strong>{next.title}</strong>
                <span>{next.text}</span>
              </div>
            </div>
          </section>

          <SettingsCard flags={flags} canWrite={canWriteSettings} saved={saved} saveError={saveError} />

          <section className="ux-card" aria-labelledby="ab-connect-title">
            <header className="ux-card-head">
              <h2 id="ab-connect-title">Connect an assistant</h2>
              <span>Copying does not connect anything by itself</span>
            </header>
            <div className="ux-card-body">
              <p>
                Copy the prompt for your assistant and paste it into a new chat. The assistant asks you to sign in to
                BookOne and press <strong>Allow</strong>. Then it shows under Connected assistants.
              </p>
              {promptError ? (
                <p className="ab-settings-note is-error" role="alert">
                  {promptError}
                </p>
              ) : (
                <div className="ab-prompt-grid">
                  {prompts.map((card) => (
                    <article key={card.client} className="ab-prompt-card" aria-labelledby={`ab-prompt-${card.client}`}>
                      <div className="ab-prompt-text">
                        <h3 id={`ab-prompt-${card.client}`}>{card.title}</h3>
                        <p className="ab-prompt-surface">{card.surface}</p>
                      </div>
                      <CopyPromptButton value={card.prompt} name={card.title} primary={flags.enabled && active.length === 0} />
                      <details className="ab-prompt-details">
                        <summary>Show prompt</summary>
                        <textarea
                          id={`ab-prompt-text-${card.client}`}
                          className="input ab-prompt-preview"
                          readOnly
                          rows={10}
                          value={card.prompt}
                          data-ab-prompt={card.title}
                          aria-label={`${card.title} prompt`}
                        />
                      </details>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="ux-card" aria-labelledby="ab-clients-title">
            <header className="ux-card-head">
              <h2 id="ab-clients-title">Connected assistants</h2>
              <span>{live.length === 0 ? 'None yet' : `${live.length} in ${companyName}`}</span>
            </header>
            {connections.length === 0 ? (
              <p className="ab-empty">
                No assistant connected yet. Copying a connection prompt does not itself connect anything. After you
                paste it into Codex or Claude, sign in and Allow in BookOne. Then it appears here.
              </p>
            ) : (
              <ul className="ab-conn-list">
                {connections.map((row) => (
                  <ConnectionRow key={row.id} row={row} canGrant={canGrant} />
                ))}
              </ul>
            )}
          </section>

          <details className="ux-disclosure ab-tech">
            <summary>Technical details</summary>
            <dl className="ux-statement ab-tech-list">
              <div>
                <dt>Public URL </dt>
                <dd>{technical.publicUrl}</dd>
              </div>
              <div>
                <dt>MCP URL </dt>
                <dd>{technical.mcpUrl}</dd>
              </div>
              <div>
                <dt>Issuer </dt>
                <dd>{technical.issuer}</dd>
              </div>
              <div>
                <dt>Authorization URL </dt>
                <dd>{technical.authorizationUrl}</dd>
              </div>
              <div>
                <dt>JWKS URL </dt>
                <dd>{technical.jwksUrl}</dd>
              </div>
              <div>
                <dt>Codex client ID </dt>
                <dd>{technical.codexClientId}</dd>
              </div>
              <div>
                <dt>Claude client ID </dt>
                <dd>{technical.claudeClientId}</dd>
              </div>
              <div>
                <dt>Checked </dt>
                <dd>{checkedAt}</dd>
              </div>
            </dl>
          </details>
        </div>

        <aside className="ux-guide" aria-label="How AgentBridge works">
          <h2>How it works</h2>
          <ol>
            <li>
              <strong>Turn it on</strong>
              <span>Allow AI assistants for this company and save.</span>
            </li>
            <li>
              <strong>Connect</strong>
              <span>Copy the prompt into Claude or Codex, sign in to BookOne and press Allow.</span>
            </li>
            <li>
              <strong>Ask in chat</strong>
              <span>&quot;Read this supplier bill&quot;, &quot;Design my invoice like this photo&quot;, &quot;Match my website products&quot;.</span>
            </li>
            <li>
              <strong>You approve</strong>
              <span>Nothing is posted, printed or applied until you approve it here in BookOne.</span>
            </li>
          </ol>
          <div className="ux-guide-links">
            {flags.enabled ? <Link href="/purchase/inbox">Document Inbox</Link> : null}
            <Link href="/company/print-designs">Print designs</Link>
            <a href="/docs/developers/agentbridge" target="_blank" rel="noopener noreferrer">
              AgentBridge guide
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
