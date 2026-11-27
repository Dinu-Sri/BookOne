import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildConnectionPromptBundle,
  companyAccessReadiness,
  connectedClientsReadiness,
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
        <div class="ab-prompt-text">
          <h3 id="ab-prompt-${card.client}">${escapeHtml(card.title)}</h3>
          <p class="ab-prompt-surface">${escapeHtml(card.surface)}</p>
        </div>
        <button type="button" class="button ${flags.enabled ? 'primary' : 'secondary'}">Copy connection prompt</button>
        <details class="ab-prompt-details"><summary>Show prompt</summary>
          <textarea class="input ab-prompt-preview" readonly rows="10" aria-label="${escapeHtml(card.title)} prompt">${escapeHtml(card.prompt)}</textarea>
        </details>
      </article>`,
    )
    .join('');
  const server = readiness[0];
  const next =
    server && server.level !== 'ready'
      ? { tone: 'is-warn', title: 'Assistants cannot connect yet.', text: server.detail }
      : !flags.enabled
        ? {
            tone: 'is-warn',
            title: 'AI assistants are off for this company.',
            text: 'Turn on "Allow AI assistants for this company", save, then connect Claude or Codex.',
          }
        : { tone: '', title: 'Ready to connect.', text: 'Copy the prompt for your assistant below and paste it into a new chat.' };
  const rows = [
    ['Allow AI assistants for this company', 'Assistants can sign in and work here. Turn this off to stop every assistant at once.', flags.enabled, 'agentBridgeEnabled'],
    ['Supplier bills: drafts only', 'Assistants can read bills and fill in drafts, but cannot ask for a bill to be posted.', flags.draftOnly, 'agentBridgeDraftOnly'],
    ['Never post supplier bills from AgentBridge', 'Even after you approve a bill here, it is not posted through AgentBridge.', flags.postingDisabled, 'agentBridgePostingDisabled'],
  ] as const;
  const settings = rows
    .map(
      ([title, text, on, name]) => `
        <div class="ux-row"><div class="ux-row-text"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>
        <div class="ux-row-side"><label class="ux-switch"><input type="checkbox" role="switch" name="${name}" value="on" aria-label="${escapeHtml(title)}"${on ? ' checked' : ''}><span aria-hidden="true"></span></label></div></div>`,
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
<main class="workspace ux-page ab-v2 ab-company-page">
  <header class="ux-head">
    <div class="ux-head-text"><div>
      <h1 class="page-title ab-page-title">AgentBridge</h1>
      <p>Let an AI assistant such as Claude or Codex do routine work in this company. It prepares the work; you approve it.</p>
    </div></div>
  </header>
  <div class="ux-split">
    <div class="ux-main">
      <section class="ux-next" aria-label="Status"><div class="ux-next-row ${next.tone}"><div><strong>${escapeHtml(next.title)}</strong><span>${escapeHtml(next.text)}</span></div></div></section>
      <section class="ux-card" aria-labelledby="ab-settings-title"><form>
        <header class="ux-card-head"><h2 id="ab-settings-title">What assistants may do here</h2><button type="submit" class="button secondary">Save AgentBridge settings</button></header>
        <div class="ux-rows">${settings}</div>
      </form></section>
      <section class="ux-card" aria-labelledby="ab-connect-title">
        <header class="ux-card-head"><h2 id="ab-connect-title">Connect an assistant</h2><span>Copying does not connect anything by itself</span></header>
        <div class="ux-card-body">
          <p>Copy the prompt for your assistant and paste it into a new chat. The assistant asks you to sign in to BookOne and press <strong>Allow</strong>.</p>
          <div class="ab-prompt-grid">${cards}</div>
        </div>
      </section>
      <section class="ux-card" aria-labelledby="ab-clients-title">
        <header class="ux-card-head"><h2 id="ab-clients-title">Connected assistants</h2><span>None yet</span></header>
        <p class="ab-empty">No assistant connected yet. Copying a connection prompt does not itself connect anything. After you paste it into Codex or Claude, sign in and Allow in BookOne. Then it appears here.</p>
      </section>
      <details class="ux-disclosure ab-tech"><summary>Technical details</summary>
        <dl class="ux-statement ab-tech-list">
          <div><dt>Issuer </dt><dd>${escapeHtml(details.issuer)}</dd></div>
          <div><dt>MCP URL </dt><dd>${escapeHtml(details.mcpUrl)}</dd></div>
          <div><dt>JWKS URL </dt><dd>${escapeHtml(details.jwksUrl)}</dd></div>
          <div><dt>Codex client ID </dt><dd>bookone-codex</dd></div>
          <div><dt>Claude client ID </dt><dd>bookone-claude</dd></div>
        </dl>
      </details>
    </div>
    <aside class="ux-guide" aria-label="How AgentBridge works">
      <h2>How it works</h2>
      <ol>
        <li><strong>Turn it on</strong><span>Allow AI assistants for this company and save.</span></li>
        <li><strong>Connect</strong><span>Copy the prompt into Claude or Codex, sign in to BookOne and press Allow.</span></li>
        <li><strong>Ask in chat</strong><span>"Read this supplier bill", "Design my invoice like this photo", "Match my website products".</span></li>
        <li><strong>You approve</strong><span>Nothing is posted, printed or applied until you approve it here in BookOne.</span></li>
      </ol>
    </aside>
  </div>
</main>
</body>
</html>`;
}
