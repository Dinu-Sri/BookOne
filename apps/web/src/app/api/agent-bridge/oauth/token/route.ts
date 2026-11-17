import { NextRequest, NextResponse } from 'next/server';
import {
  hmacFixturesAllowed,
  mintLocalFixtureToken,
  parseRequestedScopes,
  verifyPkce,
  type Capability,
} from '@bookone/agent-bridge';
import { agentBridgeTokenSecret, takeOauthCode } from '@/lib/agent-bridge-runtime';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.formData().catch(async () => {
    const json = (await req.json().catch(() => ({}))) as Record<string, string>;
    const fd = new FormData();
    for (const [k, v] of Object.entries(json)) fd.set(k, String(v));
    return fd;
  });
  const grant = String(body.get('grant_type') ?? '');
  if (grant !== 'authorization_code') {
    return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
  }
  const code = String(body.get('code') ?? '');
  const verifier = String(body.get('code_verifier') ?? '');
  const redirectUri = String(body.get('redirect_uri') ?? '');
  const clientId = String(body.get('client_id') ?? '');
  const tenantHint = String(body.get('tenant_id') ?? process.env.AGENT_BRIDGE_OAUTH_TENANT_HINT ?? '');
  if (!code || !verifier || !clientId) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (!tenantHint) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        error_description:
          'Pass tenant_id on the token request, or set AGENT_BRIDGE_OAUTH_TENANT_HINT. Production IdP registration is still owner-configured.',
      },
      { status: 400 },
    );
  }
  const row = await takeOauthCode(tenantHint, code);
  if (!row || row.clientId !== clientId || row.redirectUri !== redirectUri) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }
  if (Date.parse(row.expiresAt.toISOString()) <= Date.now()) {
    return NextResponse.json({ error: 'invalid_grant', error_description: 'Authorization code expired.' }, { status: 400 });
  }
  if (!verifyPkce(verifier, row.codeChallenge, row.codeChallengeMethod)) {
    return NextResponse.json({ error: 'invalid_grant', error_description: 'PKCE verification failed.' }, { status: 400 });
  }
  if (!hmacFixturesAllowed(process.env)) {
    return NextResponse.json(
      {
        error: 'temporarily_unavailable',
        error_description:
          'BookOne will not mint HMAC access tokens in production. Set AGENT_BRIDGE_OAUTH_ISSUER and JWKS for an RS256 authorization server, or AGENT_BRIDGE_ALLOW_HMAC=1 only for a labelled fixture.',
      },
      { status: 503 },
    );
  }
  const scopes = parseRequestedScopes(row.scopes) as Capability[];
  const token = mintLocalFixtureToken({
    tenantId: row.tenantId,
    userId: row.userId,
    scopes,
    secret: agentBridgeTokenSecret(),
    hours: 8,
  });
  return NextResponse.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: 8 * 3600,
    scope: scopes.join(' '),
  });
}
