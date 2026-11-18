import { authorizationCallbackUrl, findPublicClient, redirectUriAllowed } from './oauth';
import type { CompanyAgentBridgeFlags } from './connection-prompts';

export type ConsentPageKind =
  | 'consent'
  | 'sign_in_required'
  | 'inbox_disabled'
  | 'permission_denied'
  | 'invalid_request'
  | 'untrusted_redirect'
  | 'cancelled'
  | 'server_error'
  | 'returning';

export type ConsentHiddenFields = {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  resource: string;
  scope: string;
};

export type ConsentPageInput = {
  kind: ConsentPageKind;
  clientId?: string;
  clientName?: string;
  companyName?: string;
  accountName?: string;
  accountEmail?: string;
  flags?: CompanyAgentBridgeFlags;
  fields?: ConsentHiddenFields;
  message?: string;
  returnUrl?: string;
  callbackUrl?: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const CONSENT_PERMISSION_ROWS = [
  {
    id: 'read',
    title: 'Read documents and policy',
    detail: 'See Document Inbox items and this company’s AgentBridge policy.',
  },
  {
    id: 'upload',
    title: 'Upload original files',
    detail: 'Store supplier originals in this company so a human can review them.',
  },
  {
    id: 'draft',
    title: 'Prepare draft bills',
    detail: 'Propose unpaid service bills for a human to review in BookOne.',
  },
] as const;

export function consentRestrictionCopy(flags: CompanyAgentBridgeFlags): string[] {
  const rows: string[] = [];
  if (flags.draftOnly) {
    rows.push('Draft-only is on: this agent may prepare drafts, not posted bills.');
  } else {
    rows.push('Draft-only is off for this company. Posting still needs a human approval in BookOne.');
  }
  if (flags.postingDisabled) {
    rows.push(
      'AgentBridge posting is stopped: the server will not post even after a human approval until you change that.',
    );
  } else {
    rows.push('AgentBridge posting-stop is off. Posting still needs an explicit grant and a human approval in BookOne.');
  }
  rows.push('These permissions do not authorize financial posting or let the agent approve its own entries.');
  return rows;
}

export function authorizationDenialUrl(
  redirectUri: string,
  args: { state?: string; issuer: string; error?: string },
): string {
  const next = new URL(redirectUri);
  next.searchParams.set('error', args.error ?? 'access_denied');
  if (args.state) next.searchParams.set('state', args.state);
  next.searchParams.set('iss', args.issuer.replace(/\/$/, ''));
  return next.toString();
}

export function safeOAuthDenialUrl(
  clientId: string,
  redirectUri: string,
  args: { state?: string; issuer: string },
): string | null {
  const client = findPublicClient(clientId);
  if (!client || !redirectUriAllowed(client, redirectUri)) return null;
  return authorizationDenialUrl(redirectUri, args);
}

const CONSENT_CSS = `
:root{color-scheme:light;--bg:#f6f8fb;--surface:#fff;--ink:#132238;--ink-muted:#5b6b7f;--ink-soft:#8492a6;--line:#dde5ef;--brand:#1677c9;--brand-strong:#0d5fa8;--brand-soft:#e8f4ff;--brand-ink:#083a67;--success:#15835f;--warning:#a76612;--danger:#c94141;--radius:12px;--focus:0 0 0 3px rgba(22,119,201,.18)}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--bg);color:var(--ink);font:16px/1.45 Inter,ui-sans-serif,system-ui,Segoe UI,sans-serif}
.ab-consent{min-height:100vh;display:grid;place-items:start center;padding:24px 16px 40px}
.ab-consent-card{width:min(40rem,100%);background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 10px 26px rgba(19,34,56,.09);padding:22px 22px 20px;display:grid;gap:16px}
.ab-consent-brand{display:flex;align-items:center;gap:10px;color:var(--brand-ink);font-weight:750}
.ab-consent-mark{width:32px;height:32px;border-radius:8px;background:var(--brand);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:800}
.ab-consent-client{display:flex;align-items:center;gap:10px}
.ab-consent-client-icon{width:40px;height:40px;border-radius:12px;background:var(--brand-soft);color:var(--brand-ink);display:grid;place-items:center;font-weight:800}
h1{margin:0;font-size:1.35rem;line-height:1.25}
.ab-consent-lead,.ab-consent-note,.ab-consent-meta p{margin:0;color:var(--ink-muted);font-size:.95rem}
.ab-consent-meta{display:grid;gap:6px;padding:12px;border:1px solid var(--line);border-radius:var(--radius);background:#f8fafc}
.ab-consent-meta strong{display:block;font-size:.8rem;letter-spacing:.02em;text-transform:uppercase;color:var(--ink-soft)}
.ab-consent-perms{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ab-consent-perms li{border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.ab-consent-perms h2{margin:0 0 4px;font-size:1rem}
.ab-consent-limits{margin:0;padding-left:1.1rem;color:var(--ink-muted);display:grid;gap:6px}
.ab-consent-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.ab-consent-actions button{min-height:44px;min-width:44px;padding:10px 16px;border-radius:10px;border:1px solid var(--line);font-weight:700;cursor:pointer}
.ab-consent-actions button:focus-visible{outline:none;box-shadow:var(--focus)}
.ab-consent-allow{background:var(--brand);border-color:var(--brand-strong);color:#fff}
.ab-consent-allow:hover{background:var(--brand-strong)}
.ab-consent-cancel{background:#fff;color:var(--ink)}
.ab-consent-progress{margin:0;color:var(--brand-ink);font-weight:650}
.ab-consent-progress[hidden]{display:none}
.ab-consent-error{color:var(--danger);margin:0}
.ab-consent-next{margin:0;padding-left:1.1rem}
a{color:var(--brand-strong)}
@media (max-width:520px){
  .ab-consent{padding:12px}
  .ab-consent-card{padding:16px}
  .ab-consent-actions{flex-direction:column;align-items:stretch}
  .ab-consent-actions button{width:100%}
}
`;

function hiddenInputs(fields: ConsentHiddenFields): string {
  return Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
    .join('');
}

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${CONSENT_CSS}</style></head><body>${body}</body></html>`;
}

function brandHeader(): string {
  return `<div class="ab-consent-brand"><span class="ab-consent-mark" aria-hidden="true">B1</span><span>BookOne</span></div>`;
}

export function consentPageTitle(input: ConsentPageInput): string {
  if (input.kind === 'consent' || input.kind === 'returning') {
    const name = input.clientName || 'this assistant';
    return `Connect ${name} to BookOne`;
  }
  if (input.kind === 'untrusted_redirect') return 'This connection request is not trusted';
  if (input.kind === 'cancelled') return 'Connection cancelled';
  if (input.kind === 'sign_in_required') return 'Sign in to BookOne';
  if (input.kind === 'inbox_disabled') return 'Document Inbox is off';
  if (input.kind === 'permission_denied') return 'You cannot connect this assistant';
  if (input.kind === 'server_error') return 'BookOne could not finish this request';
  return 'This connection request is invalid';
}

export function renderConsentPage(input: ConsentPageInput): string {
  const title = consentPageTitle(input);
  const clientName = input.clientName || 'this assistant';
  const company = input.companyName || 'this company';
  if (input.kind === 'consent' && input.fields) {
    const flags = input.flags ?? { enabled: true, draftOnly: true, postingDisabled: true };
    const perms = CONSENT_PERMISSION_ROWS.map(
      (row) =>
        `<li><h2>${escapeHtml(row.title)}</h2><p class="ab-consent-lead">${escapeHtml(row.detail)}</p></li>`,
    ).join('');
    const limits = consentRestrictionCopy(flags)
      .map((row) => `<li>${escapeHtml(row)}</li>`)
      .join('');
    const account = input.accountEmail
      ? `${input.accountName || input.accountEmail} (${input.accountEmail})`
      : input.accountName || 'Signed-in BookOne user';
    const body = `
      <main class="ab-consent">
        <section class="ab-consent-card" aria-labelledby="ab-consent-title">
          ${brandHeader()}
          <div class="ab-consent-client">
            <div class="ab-consent-client-icon" aria-hidden="true">${escapeHtml(clientName.slice(0, 1).toUpperCase())}</div>
            <div>
              <h1 id="ab-consent-title">${escapeHtml(title)}</h1>
              <p class="ab-consent-lead">${escapeHtml(clientName)} is asking to work with Document Inbox in ${escapeHtml(company)}. This grants read, upload and draft.</p>
            </div>
          </div>
          <div class="ab-consent-meta">
            <p><strong>Signed in as</strong> ${escapeHtml(account)}</p>
            <p><strong>Company</strong> ${escapeHtml(company)}</p>
          </div>
          <ul class="ab-consent-perms">${perms}</ul>
          <ul class="ab-consent-limits">${limits}</ul>
          <p class="ab-consent-note">To use a different company, cancel, switch company in BookOne, then run the client login again. This page never silently binds another company.</p>
          <form method="post" id="ab-consent-form" data-ab-consent="1">
            ${hiddenInputs(input.fields)}
            <div class="ab-consent-actions">
              <button class="ab-consent-allow" type="submit" name="decision" value="allow" aria-label="Allow ${escapeHtml(clientName)} to connect to BookOne">Allow connection</button>
              <button class="ab-consent-cancel" type="submit" name="decision" value="deny">Cancel</button>
            </div>
            <p class="ab-consent-progress" hidden role="status" aria-live="polite">Connecting… please wait.</p>
          </form>
          <p class="ab-consent-note">After you allow, BookOne returns you to ${escapeHtml(clientName)} on this computer. That local completion page is served by the client, not by BookOne.</p>
        </section>
      </main>
      <script>
        (function(){
          var form=document.getElementById('ab-consent-form');
          if(!form) return;
          form.addEventListener('submit', function(ev){
            if(form.getAttribute('data-busy')==='1'){ev.preventDefault();return;}
            form.setAttribute('data-busy','1');
            form.setAttribute('aria-busy','true');
            var progress=form.querySelector('.ab-consent-progress');
            if(progress) progress.hidden=false;
            var buttons=form.querySelectorAll('button');
            for(var i=0;i<buttons.length;i++) buttons[i].disabled=true;
          });
        })();
      </script>`;
    return shell(title, body);
  }

  if (input.kind === 'returning' && input.callbackUrl) {
    const safe = escapeHtml(input.callbackUrl);
    const body = `
      <main class="ab-consent">
        <section class="ab-consent-card" aria-labelledby="ab-consent-title">
          ${brandHeader()}
          <h1 id="ab-consent-title">Returning to ${escapeHtml(clientName)}</h1>
          <p class="ab-consent-lead">BookOne recorded your Allow. Continue in ${escapeHtml(clientName)} on this computer. The next page is served by that client.</p>
          <p><a href="${safe}">Continue</a></p>
          <meta http-equiv="refresh" content="0;url=${safe}">
        </section>
      </main>`;
    return shell(title, body);
  }

  const nextSteps: string[] = [];
  if (input.kind === 'sign_in_required') {
    nextSteps.push('Sign in to BookOne with the company you want to connect.');
    nextSteps.push('Then run the client login again so the pending request is preserved.');
  } else if (input.kind === 'inbox_disabled') {
    nextSteps.push('Open Company → AgentBridge and turn on Document Inbox for this company.');
    nextSteps.push('Leave draft-only and posting-stop as they are unless an owner authorizes a change.');
    nextSteps.push('Then run a fresh client login. Do not reuse a consumed authorization code.');
  } else if (input.kind === 'permission_denied') {
    nextSteps.push('Ask an owner to grant Document Inbox access for your job.');
    nextSteps.push('Then retry with a fresh authorization.');
  } else if (input.kind === 'untrusted_redirect') {
    nextSteps.push('This request asked BookOne to send you somewhere that is not a registered BookOne callback.');
    nextSteps.push('Close this tab. Start again from the official Codex or Claude connection prompt.');
  } else if (input.kind === 'cancelled') {
    nextSteps.push('No access was granted.');
    nextSteps.push('You can return to Company → AgentBridge and copy a connection prompt if you still want to connect.');
  } else if (input.kind === 'server_error') {
    nextSteps.push('Wait a moment, then retry with a fresh authorization.');
    nextSteps.push('Do not reuse a consumed authorization code.');
  } else {
    nextSteps.push('Start again from Company → AgentBridge using the Codex or Claude prompt.');
    nextSteps.push('Do not paste authorization codes, verifiers, or tokens into chat.');
  }

  const settingsLink =
    input.kind === 'untrusted_redirect'
      ? ''
      : `<p><a href="${escapeHtml(input.returnUrl || '/company/agent-bridge')}">Open AgentBridge settings</a></p>`;

  const body = `
    <main class="ab-consent">
      <section class="ab-consent-card" aria-labelledby="ab-consent-title">
        ${brandHeader()}
        <h1 id="ab-consent-title">${escapeHtml(title)}</h1>
        <p class="ab-consent-error" role="alert">${escapeHtml(input.message || title)}</p>
        <ol class="ab-consent-next">${nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
        ${settingsLink}
      </section>
    </main>`;
  return shell(title, body);
}

export { authorizationCallbackUrl };
