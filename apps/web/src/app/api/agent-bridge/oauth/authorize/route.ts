import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_CONNECTION_SCOPES,
  consentConnectionScopes,
  encodeTenantBoundCode,
  findPublicClient,
  newId,
  redirectUriAllowed,
} from '@bookone/agent-bridge';
import { requireTenantContext } from '@bookone/auth';
import { recordAgentBridgeConnection, saveOauthCode } from '@/lib/agent-bridge-runtime';
import { loadAgentBridgeFlags } from '@/lib/agent-bridge-runtime';

export const runtime = 'nodejs';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function html(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>BookOne AgentBridge consent</title></head><body style="font-family:system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem">${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(req: NextRequest) {
  try {
    await requireTenantContext();
  } catch {
    const next = encodeURIComponent(req.url);
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
  }
  const url = req.nextUrl;
  const clientId = url.searchParams.get('client_id') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const challenge = url.searchParams.get('code_challenge') ?? '';
  const method = url.searchParams.get('code_challenge_method') ?? '';
  const resource = url.searchParams.get('resource') ?? '';
  const client = findPublicClient(clientId);
  if (!client) return html('<p>Unknown client. Use bookone-codex or bookone-claude.</p>', 400);
  if (!redirectUriAllowed(client, redirectUri)) return html('<p>redirect_uri is not allowed for this client.</p>', 400);
  if (method !== 'S256' || challenge.length < 43) return html('<p>PKCE S256 code_challenge is required.</p>', 400);
  return html(`
    <h1>Connect ${client.clientName} to BookOne</h1>
    <p>This grants read, upload and draft for Document Inbox in the company you are signed into. Posting still needs a human approval in BookOne. Agents cannot mint approvals.</p>
    <form method="post">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <input type="hidden" name="state" value="${escapeHtml(state)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(challenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(method)}" />
      <input type="hidden" name="resource" value="${escapeHtml(resource)}" />
      <input type="hidden" name="scope" value="${escapeHtml(DEFAULT_CONNECTION_SCOPES.join(' '))}" />
      <button type="submit">Allow ${escapeHtml(client.clientName)}</button>
    </form>
  `);
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireTenantContext();
  } catch {
    return html('<p>Sign in to BookOne first.</p>', 401);
  }
  const flags = await loadAgentBridgeFlags(user.tenantId);
  if (!flags.enabled) return html('<p>Turn on Document Inbox in Purchase settings before connecting an agent.</p>', 403);
  const form = await req.formData();
  const clientId = String(form.get('client_id') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');
  const state = String(form.get('state') ?? '');
  const challenge = String(form.get('code_challenge') ?? '');
  const method = String(form.get('code_challenge_method') ?? 'S256');
  const client = findPublicClient(clientId);
  if (!client || !redirectUriAllowed(client, redirectUri) || method !== 'S256') {
    return html('<p>Consent request is invalid.</p>', 400);
  }
  const scopes = consentConnectionScopes();
  const connectionId = newId();
  await recordAgentBridgeConnection({
    id: connectionId,
    tenantId: user.tenantId,
    userId: user.id,
    clientId,
    scopes,
    label: client.clientName,
    createdAt: new Date().toISOString(),
  });
  const code = encodeTenantBoundCode(user.tenantId);
  await saveOauthCode({
    code,
    tenantId: user.tenantId,
    userId: user.id,
    clientId,
    redirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    scopes: scopes.join(','),
    connectionId,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  const next = new URL(redirectUri);
  next.searchParams.set('code', code);
  if (state) next.searchParams.set('state', state);
  return NextResponse.redirect(next);
}
