import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildConnectionPromptBundle,
  companyAccessReadiness,
  connectedClientsReadiness,
  effectiveFlagsExplanation,
  publicConnectionDetails,
  serverConnectionReadiness,
  validatePublicHttpsOrigin,
  type PublicConnectionDetails,
} from '@bookone/agent-bridge';

export function sampleConnectionDetails(signingReady = true): PublicConnectionDetails {
  return publicConnectionDetails('https://bookone.clossyan.com', signingReady);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function levelLabel(level: string) {
  if (level === 'ready') return 'Ready';
  if (level === 'setup_needed') return 'Setup needed';
  return 'Unavailable';
}

export function connectionSetupHtml(
  details: PublicConnectionDetails = sampleConnectionDetails(),
  opts?: { flags?: { enabled: boolean; draftOnly: boolean; postingDisabled: boolean }; activeClients?: number },
) {
  const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
  const flags = opts?.flags ?? { enabled: false, draftOnly: true, postingDisabled: true };
  const originCheck = validatePublicHttpsOrigin(details.publicUrl);
  const bundle = originCheck.ok ? buildConnectionPromptBundle(details.publicUrl, details.signingReady) : null;
  const prompts = bundle?.prompts ?? [];
  const readiness = [
    serverConnectionReadiness({ signingReady: details.signingReady, originCheck }),
    companyAccessReadiness(flags),
    connectedClientsReadiness(opts?.activeClients ?? 0),
  ];
  const cards = prompts
    .map(
      (card) => `
      <article class="ab-prompt-card" aria-labelledby="ab-prompt-${card.client}">
        <h3 id="ab-prompt-${card.client}">${escapeHtml(card.title)}</h3>
        <p class="ab-prompt-surface">${escapeHtml(card.surface)}</p>
        <textarea class="input ab-prompt-preview" readonly rows="12" aria-label="${escapeHtml(card.title)} prompt">${escapeHtml(card.prompt)}</textarea>
        <button type="button" class="button primary">Copy connection prompt</button>
      </article>`,
    )
    .join('');
  const status = readiness
    .map(
      (item) => `
      <li class="ab-status-item is-${item.level}">
        <div class="ab-status-row"><strong>${escapeHtml(item.label)}</strong><span class="ab-status-pill">${levelLabel(item.level)}</span></div>
        <p>${escapeHtml(item.detail)}</p>
      </li>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgentBridge</title>
<style>${css}</style>
</head>
<body>
<main class="workspace party-workspace ab-company-page ab-connect-page">
  <section class="ab-connect party-form-shell" aria-labelledby="ab-page-title">
    <header class="ab-page-head">
      <h1 id="ab-page-title" class="ab-page-title">AgentBridge</h1>
      <p class="ab-connect-lead">Connect an AI assistant to help prepare and review business entries under BookOne's rules and permissions.</p>
    </header>
    <section class="ab-panel" aria-labelledby="ab-status-title">
      <h2 id="ab-status-title">Status</h2>
      <p class="ab-checked-at">Checked 2026-11-18 12:00 UTC</p>
      <ul class="ab-status-list">${status}</ul>
    </section>
    <section class="ab-panel" aria-labelledby="ab-settings-title">
      <h2 id="ab-settings-title">Company settings</h2>
      <p class="ab-connect-lead">${escapeHtml(effectiveFlagsExplanation(flags))}</p>
      <button type="submit" class="button primary">Save AgentBridge settings</button>
    </section>
    <section class="ab-panel" aria-labelledby="ab-connect-title">
      <h2 id="ab-connect-title">Connect your assistant</h2>
      <div class="ab-prompt-grid">${cards}</div>
    </section>
    <section class="ab-panel" aria-labelledby="ab-clients-title">
      <h2 id="ab-clients-title">Connected clients</h2>
      <table class="data-table" style="width:100%">
        <thead><tr><th>Client</th><th>Company</th><th>Allowed</th><th>Status</th><th>Last use</th><th>Created</th><th></th></tr></thead>
        <tbody><tr><td colspan="7">No authenticated clients yet. Copying a connection prompt does not itself connect anything. After you paste it into Codex or Claude, sign in and Allow in BookOne. Then the client appears here.</td></tr></tbody>
      </table>
    </section>
    <details class="ab-tech"><summary>Technical details</summary>
      <p>Issuer ${escapeHtml(details.issuer)}</p>
      <p>MCP URL ${escapeHtml(details.mcpUrl)}</p>
      <p>JWKS URL ${escapeHtml(details.jwksUrl)}</p>
      <p>Codex client ID bookone-codex</p>
      <p>Claude client ID bookone-claude</p>
    </details>
  </section>
</main>
</body>
</html>`;
}
