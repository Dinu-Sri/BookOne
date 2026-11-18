import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  claudeConnectorSteps,
  codexSetupCommand,
  publicConnectionDetails,
  type PublicConnectionDetails,
} from '@bookone/agent-bridge';

export function sampleConnectionDetails(signingReady = true): PublicConnectionDetails {
  return publicConnectionDetails('https://bookone.clossyan.com', signingReady);
}

export function connectionSetupHtml(details: PublicConnectionDetails = sampleConnectionDetails()) {
  const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
  const codex = codexSetupCommand(details.mcpUrl);
  const claude = claudeConnectorSteps(details.mcpUrl).join('\n');
  const status = details.signingReady
    ? 'Signing is ready. Supported clients can complete login after you allow them.'
    : 'Signing is not ready yet.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect a supported AI client</title>
<style>${css}</style>
</head>
<body>
<main class="workspace party-workspace ab-connect-page">
  <section class="ab-connect party-form-shell" aria-labelledby="ab-connect-title">
    <h2 id="ab-connect-title">Connect a supported AI client</h2>
    <p class="ab-connect-lead">Copy these public BookOne addresses into Codex or Claude. There is no client secret.</p>
    <p class="ab-connect-status ${details.signingReady ? 'is-ready' : 'is-blocked'}" role="status">${status}</p>
    <div class="ab-connect-row"><label>Public URL</label><div class="ab-connect-value"><input class="input" readonly value="${details.publicUrl}" aria-label="Public URL"></div></div>
    <div class="ab-connect-row"><label>Issuer</label><div class="ab-connect-value"><input class="input" readonly value="${details.issuer}" aria-label="Issuer"></div></div>
    <div class="ab-connect-row"><label>JWKS URL</label><div class="ab-connect-value"><input class="input" readonly value="${details.jwksUrl}" aria-label="JWKS URL"></div></div>
    <div class="ab-connect-row"><label>MCP URL</label><div class="ab-connect-value"><input class="input" readonly value="${details.mcpUrl}" aria-label="MCP URL"></div></div>
    <div class="ab-connect-row"><label>Codex client ID</label><div class="ab-connect-value"><input class="input" readonly value="bookone-codex" aria-label="Codex client ID"></div></div>
    <div class="ab-connect-row"><label>Claude client ID</label><div class="ab-connect-value"><input class="input" readonly value="bookone-claude" aria-label="Claude client ID"></div></div>
    <div class="ab-connect-row"><label>Codex CLI</label><div class="ab-connect-value"><textarea class="input" readonly rows="2" aria-label="Codex CLI">${codex}</textarea></div></div>
    <div class="ab-connect-row"><label>Claude connector</label><div class="ab-connect-value"><textarea class="input" readonly rows="5" aria-label="Claude connector">${claude}</textarea></div></div>
  </section>
</main>
</body>
</html>`;
}
