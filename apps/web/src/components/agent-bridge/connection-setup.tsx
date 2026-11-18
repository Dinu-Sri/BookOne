'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/bookone-ui';

/** Serializable connection copy fields. Keep Node packages off this client module. */
export type ConnectionSetupDetails = {
  publicUrl: string;
  issuer: string;
  jwksUrl: string;
  mcpUrl: string;
  signingReady: boolean;
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[data-ab-copy="${CSS.escape(label)}"]`,
      );
      field?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <Button type="button" variant="secondary" onClick={copy} aria-label={`Copy ${label}`}>
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ab-connect-row">
      <label htmlFor={`ab-connect-${label}`}>{label}</label>
      <div className="ab-connect-value">
        <input
          id={`ab-connect-${label}`}
          className="input"
          readOnly
          value={value}
          data-ab-copy={label}
          aria-label={label}
        />
        <CopyButton value={value} label={label} />
      </div>
    </div>
  );
}

export function AgentBridgeConnectionSetup({
  details,
  inboxEnabled,
  codexCommand,
  claudeConnector,
}: {
  details: ConnectionSetupDetails;
  inboxEnabled: boolean;
  codexCommand: string;
  claudeConnector: string;
}) {
  return (
    <section className="ab-connect" aria-labelledby="ab-connect-title">
      <h2 id="ab-connect-title">Connect a supported AI client</h2>
      <p className="ab-connect-lead">
        Copy these public BookOne addresses into Codex or Claude. There is no client secret. New connections receive
        read, upload and draft. Posting still needs a human approval in BookOne.
      </p>
      <p
        className={details.signingReady ? 'ab-connect-status is-ready' : 'ab-connect-status is-blocked'}
        role="status"
      >
        {details.signingReady
          ? 'Signing is ready. Supported clients can complete login after you allow them.'
          : 'Signing is not ready yet. Wait for the usual Portainer image update, then refresh this page.'}
      </p>
      {!inboxEnabled ? (
        <p className="ab-connect-status" role="status">
          Turn on Document Inbox in Purchase settings before an AI client can finish consent. Leave draft-only and
          posting-stop on until independent QA authorizes posting.
        </p>
      ) : null}
      <CopyRow label="Public URL" value={details.publicUrl} />
      <CopyRow label="Issuer" value={details.issuer} />
      <CopyRow label="JWKS URL" value={details.jwksUrl} />
      <CopyRow label="MCP URL" value={details.mcpUrl} />
      <CopyRow label="Codex client ID" value="bookone-codex" />
      <CopyRow label="Claude client ID" value="bookone-claude" />
      <div className="ab-connect-row">
        <label htmlFor="ab-connect-codex">Codex CLI</label>
        <div className="ab-connect-value">
          <textarea
            id="ab-connect-codex"
            className="input"
            readOnly
            rows={2}
            value={codexCommand}
            data-ab-copy="Codex CLI"
            aria-label="Codex CLI"
          />
          <CopyButton value={codexCommand} label="Codex CLI" />
        </div>
      </div>
      <div className="ab-connect-row">
        <label htmlFor="ab-connect-claude">Claude connector</label>
        <div className="ab-connect-value">
          <textarea
            id="ab-connect-claude"
            className="input"
            readOnly
            rows={5}
            value={claudeConnector}
            data-ab-copy="Claude connector"
            aria-label="Claude connector"
          />
          <CopyButton value={claudeConnector} label="Claude connector" />
        </div>
      </div>
    </section>
  );
}
