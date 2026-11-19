import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_CONNECTION_SCOPES,
  authorizationCallbackUrl,
  consentConnectionScopes,
  encodeTenantBoundCode,
  findPublicClient,
  newId,
  newOauthRequestId,
  oauthIssuer,
  publicOrigin,
  redirectUriAllowed,
  renderConsentPage,
  resourceAllowed,
  safeOAuthDenialUrl,
  buildOauthRedeemDiagnostic,
  emptyOauthRedeemFlags,
} from '@bookone/agent-bridge';
import { requireTenantContext } from '@bookone/auth';
import { db, eq, tenants, withTenantContext } from '@bookone/db';
import { recordAgentBridgeConnection, recordOauthRedeemDiagnostic, saveOauthCode } from '@/lib/agent-bridge-runtime';
import { loadAgentBridgeFlags } from '@/lib/agent-bridge-runtime';

export const runtime = 'nodejs';

function html(kind: Parameters<typeof renderConsentPage>[0]['kind'], extra: Parameters<typeof renderConsentPage>[0] = { kind }, status = 200) {
  return new NextResponse(renderConsentPage({ ...extra, kind }), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function originFrom(req: NextRequest): string {
  return publicOrigin(process.env, req.nextUrl.origin);
}

async function companyNameFor(tenantId: string): Promise<string> {
  return withTenantContext(tenantId, async () => {
    const [row] = await db().select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return row?.name?.trim() || 'this company';
  });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  let user;
  try {
    user = await requireTenantContext();
  } catch {
    const next = encodeURIComponent(`${url.pathname}${url.search}`);
    return NextResponse.redirect(new URL(`/login?from=${next}`, req.url));
  }
  const clientId = url.searchParams.get('client_id') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const challenge = url.searchParams.get('code_challenge') ?? '';
  const method = url.searchParams.get('code_challenge_method') ?? '';
  const resource = url.searchParams.get('resource') ?? '';
  const client = findPublicClient(clientId);
  if (!client) {
    return html('invalid_request', { kind: 'invalid_request', message: 'Unknown client. Use bookone-codex or bookone-claude.' }, 400);
  }
  if (!redirectUriAllowed(client, redirectUri)) {
    return html(
      'untrusted_redirect',
      {
        kind: 'untrusted_redirect',
        clientName: client.clientName,
        message: 'redirect_uri is not allowed for this client. BookOne will not send you elsewhere.',
      },
      400,
    );
  }
  if (!resourceAllowed(originFrom(req), resource)) {
    return html('invalid_request', { kind: 'invalid_request', clientName: client.clientName, message: 'resource is not allowed for this client.' }, 400);
  }
  if (method !== 'S256' || challenge.length < 43) {
    return html('invalid_request', { kind: 'invalid_request', clientName: client.clientName, message: 'PKCE S256 code_challenge is required.' }, 400);
  }
  const flags = await loadAgentBridgeFlags(user.tenantId);
  const companyName = await companyNameFor(user.tenantId);
  if (!flags.enabled) {
    return html(
      'inbox_disabled',
      {
        kind: 'inbox_disabled',
        clientName: client.clientName,
        companyName,
        message: 'Turn on Document Inbox in Company → AgentBridge before connecting an agent.',
      },
      403,
    );
  }
  return html('consent', {
    kind: 'consent',
    clientId,
    clientName: client.clientName,
    companyName,
    accountName: user.name,
    accountEmail: user.email,
    flags,
    fields: {
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: method,
      resource,
      scope: DEFAULT_CONNECTION_SCOPES.join(' '),
    },
  });
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireTenantContext();
  } catch {
    return html('sign_in_required', { kind: 'sign_in_required', message: 'Sign in to BookOne first.' }, 401);
  }
  const form = await req.formData();
  const clientId = String(form.get('client_id') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');
  const state = String(form.get('state') ?? '');
  const challenge = String(form.get('code_challenge') ?? '');
  const method = String(form.get('code_challenge_method') ?? 'S256');
  const resource = String(form.get('resource') ?? '');
  const decision = String(form.get('decision') ?? 'allow');
  const client = findPublicClient(clientId);
  const issuer = oauthIssuer(process.env) || originFrom(req);

  if (!client) {
    return html('invalid_request', { kind: 'invalid_request', message: 'Consent request is invalid.' }, 400);
  }
  if (!redirectUriAllowed(client, redirectUri)) {
    return html(
      'untrusted_redirect',
      {
        kind: 'untrusted_redirect',
        clientName: client.clientName,
        message: 'redirect_uri is not allowed for this client. BookOne will not send you elsewhere.',
      },
      400,
    );
  }
  if (!resourceAllowed(originFrom(req), resource) || method !== 'S256') {
    return html('invalid_request', { kind: 'invalid_request', clientName: client.clientName, message: 'Consent request is invalid.' }, 400);
  }

  if (decision === 'deny') {
    const denial = safeOAuthDenialUrl(clientId, redirectUri, { state, issuer });
    if (!denial) {
      return html(
        'untrusted_redirect',
        {
          kind: 'untrusted_redirect',
          clientName: client.clientName,
          message: 'Cancel cannot redirect to an untrusted address.',
        },
        400,
      );
    }
    return NextResponse.redirect(denial);
  }

  const flags = await loadAgentBridgeFlags(user.tenantId);
  if (!flags.enabled) {
    return html(
      'inbox_disabled',
      {
        kind: 'inbox_disabled',
        clientName: client.clientName,
        companyName: await companyNameFor(user.tenantId),
        message: 'Turn on Document Inbox in Company → AgentBridge before connecting an agent.',
      },
      403,
    );
  }

  try {
    const scopes = consentConnectionScopes();
    const connectionId = await recordAgentBridgeConnection({
      id: newId(),
      tenantId: user.tenantId,
      userId: user.id,
      clientId,
      scopes,
      label: client.clientName,
      createdAt: new Date().toISOString(),
    });
    const code = encodeTenantBoundCode(user.tenantId);
    const requestId = newOauthRequestId();
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
      requestId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await recordOauthRedeemDiagnostic({
      tenantId: user.tenantId,
      connectionId,
      clientId,
      diagnostic: buildOauthRedeemDiagnostic({
        requestId,
        reason: 'code_issued',
        flags: emptyOauthRedeemFlags({
          boundPresent: true,
          usedBoundTenant: true,
          rowFound: true,
          codeLength: code.length,
          storedHost: (() => {
            try {
              return new URL(redirectUri).hostname;
            } catch {
              return null;
            }
          })(),
          challengeMethod: 'S256',
        }),
      }),
    });
    const redirect = NextResponse.redirect(authorizationCallbackUrl(redirectUri, { code, state, issuer }));
    redirect.headers.set('X-BookOne-OAuth-Request-Id', requestId);
    return redirect;
  } catch {
    return html(
      'server_error',
      {
        kind: 'server_error',
        clientName: client.clientName,
        message: 'BookOne could not finish this authorization request.',
      },
      500,
    );
  }
}
