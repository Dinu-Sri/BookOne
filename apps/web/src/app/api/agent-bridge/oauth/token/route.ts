import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_CONNECTION_SCOPES,
  hmacFixturesAllowed,
  isRefreshTokenValue,
  mintLocalFixtureToken,
  mintRs256AccessToken,
  oauthKid,
  oauthSigningPem,
  OAUTH_SETUP_CHECKLIST,
  parseRequestedScopes,
  TOKEN_AUDIENCE,
  verifyPkce,
  encodeTenantBoundCode,
  type Capability,
} from '@bookone/agent-bridge';
import { agentBridgeTokenSecret, saveOauthCode, takeOauthCode } from '@/lib/agent-bridge-runtime';

export const runtime = 'nodejs';

const ACCESS_TTL_HOURS = 8;
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;

function jsonError(error: string, status: number, description?: string) {
  return NextResponse.json(description ? { error, error_description: description } : { error }, { status });
}

async function mintTokens(row: {
  tenantId: string;
  userId: string;
  clientId: string;
  connectionId: string | null;
  scopes: string;
  redirectUri: string;
}) {
  const parsed = parseRequestedScopes(row.scopes).filter((s) => s !== 'approve' && s !== 'post') as Capability[];
  const scopes = parsed.length ? parsed : [...DEFAULT_CONNECTION_SCOPES];
  const connectionId = row.connectionId || row.userId;
  const pem = oauthSigningPem(process.env);
  const issuer = (process.env.AGENT_BRIDGE_OAUTH_ISSUER || process.env.AGENT_BRIDGE_PUBLIC_URL || process.env.AUTH_URL || '')
    .trim()
    .replace(/\/$/, '');
  let accessToken: string;
  if (pem) {
    if (!issuer) {
      return { error: jsonError('temporarily_unavailable', 503, OAUTH_SETUP_CHECKLIST) };
    }
    accessToken = mintRs256AccessToken({
      privateKeyPem: pem,
      kid: oauthKid(process.env),
      issuer,
      tenantId: row.tenantId,
      userId: row.userId,
      clientId: row.clientId,
      connectionId,
      scopes,
      hours: ACCESS_TTL_HOURS,
    });
  } else if (hmacFixturesAllowed(process.env)) {
    accessToken = mintLocalFixtureToken({
      tenantId: row.tenantId,
      userId: row.userId,
      scopes,
      secret: agentBridgeTokenSecret(),
      hours: ACCESS_TTL_HOURS,
    });
  } else {
    return { error: jsonError('temporarily_unavailable', 503, OAUTH_SETUP_CHECKLIST) };
  }
  const refresh = encodeTenantBoundCode(row.tenantId, 'refresh');
  await saveOauthCode({
    code: refresh,
    tenantId: row.tenantId,
    userId: row.userId,
    clientId: row.clientId,
    redirectUri: row.redirectUri,
    codeChallenge: 'refresh_token',
    codeChallengeMethod: 'none',
    scopes: scopes.join(','),
    connectionId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return {
    body: {
      access_token: accessToken,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_HOURS * 3600,
      scope: scopes.join(' '),
      audience: TOKEN_AUDIENCE,
    },
  };
}

export async function POST(req: NextRequest) {
  const body = await req.formData().catch(async () => {
    const json = (await req.json().catch(() => ({}))) as Record<string, string>;
    const fd = new FormData();
    for (const [k, v] of Object.entries(json)) fd.set(k, String(v));
    return fd;
  });
  const grant = String(body.get('grant_type') ?? '');
  const clientId = String(body.get('client_id') ?? '');
  if (!clientId) return jsonError('invalid_request', 400);

  if (grant === 'refresh_token') {
    const refresh = String(body.get('refresh_token') ?? '');
    if (!refresh || !isRefreshTokenValue(refresh)) return jsonError('invalid_request', 400);
    const row = await takeOauthCode(refresh);
    if (!row || row.clientId !== clientId || row.codeChallenge !== 'refresh_token') {
      return jsonError('invalid_grant', 400);
    }
    if (Date.parse(row.expiresAt.toISOString()) <= Date.now()) {
      return jsonError('invalid_grant', 400, 'Refresh token expired.');
    }
    const minted = await mintTokens({
      tenantId: row.tenantId,
      userId: row.userId,
      clientId: row.clientId,
      connectionId: row.connectionId,
      scopes: row.scopes,
      redirectUri: row.redirectUri,
    });
    if ('error' in minted) return minted.error;
    return NextResponse.json(minted.body);
  }

  if (grant !== 'authorization_code') {
    return jsonError('unsupported_grant_type', 400);
  }
  const code = String(body.get('code') ?? '');
  const verifier = String(body.get('code_verifier') ?? '');
  const redirectUri = String(body.get('redirect_uri') ?? '');
  const tenantHint = String(body.get('tenant_id') ?? process.env.AGENT_BRIDGE_OAUTH_TENANT_HINT ?? '');
  if (!code || !verifier || !clientId) {
    return jsonError('invalid_request', 400);
  }
  const row = await takeOauthCode(code, tenantHint || undefined);
  if (!row || row.clientId !== clientId || row.redirectUri !== redirectUri) {
    return jsonError('invalid_grant', 400);
  }
  if (Date.parse(row.expiresAt.toISOString()) <= Date.now()) {
    return jsonError('invalid_grant', 400, 'Authorization code expired.');
  }
  if (!verifyPkce(verifier, row.codeChallenge, row.codeChallengeMethod)) {
    return jsonError('invalid_grant', 400, 'PKCE verification failed.');
  }
  const minted = await mintTokens({
    tenantId: row.tenantId,
    userId: row.userId,
    clientId: row.clientId,
    connectionId: row.connectionId,
    scopes: row.scopes,
    redirectUri: row.redirectUri,
  });
  if ('error' in minted) return minted.error;
  return NextResponse.json(minted.body);
}
