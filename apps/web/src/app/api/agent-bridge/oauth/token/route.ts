import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_CONNECTION_SCOPES,
  hmacFixturesAllowed,
  isRefreshTokenValue,
  mintLocalFixtureToken,
  mintRs256AccessToken,
  oauthKid,
  oauthIssuer,
  ensureOauthSigningPem,
  OAUTH_SETUP_CHECKLIST,
  parseRequestedScopes,
  TOKEN_AUDIENCE,
  encodeTenantBoundCode,
  newOauthRequestId,
  type Capability,
} from '@bookone/agent-bridge';
import {
  agentBridgeTokenSecret,
  markAgentBridgeTokenIssued,
  redeemOauthCode,
  saveOauthCode,
} from '@/lib/agent-bridge-runtime';

export const runtime = 'nodejs';

const ACCESS_TTL_HOURS = 8;
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;

function jsonError(error: string, status: number, description?: string, requestId?: string) {
  const res = NextResponse.json(description ? { error, error_description: description } : { error }, { status });
  if (requestId) res.headers.set('X-BookOne-OAuth-Request-Id', requestId);
  return res;
}

function withRequestId(res: NextResponse | undefined, requestId?: string) {
  const out = res ?? jsonError('temporarily_unavailable', 503, OAUTH_SETUP_CHECKLIST, requestId);
  if (requestId) out.headers.set('X-BookOne-OAuth-Request-Id', requestId);
  return out;
}

function mintIsReady(): boolean {
  const pem = ensureOauthSigningPem(process.env);
  const issuer = oauthIssuer(process.env);
  if (pem) return Boolean(issuer);
  return hmacFixturesAllowed(process.env);
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
  const pem = ensureOauthSigningPem(process.env);
  const issuer = oauthIssuer(process.env);
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
  await markAgentBridgeTokenIssued(row.tenantId, row.connectionId);
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
  const requestId = newOauthRequestId();
  const body = await req.formData().catch(async () => {
    const json = (await req.json().catch(() => ({}))) as Record<string, string>;
    const fd = new FormData();
    for (const [k, v] of Object.entries(json)) fd.set(k, String(v));
    return fd;
  });
  const grant = String(body.get('grant_type') ?? '');
  const clientId = String(body.get('client_id') ?? '').trim();
  if (!clientId) return jsonError('invalid_request', 400, undefined, requestId);

  if (grant === 'refresh_token') {
    const refresh = String(body.get('refresh_token') ?? '').trim();
    if (!refresh || !isRefreshTokenValue(refresh)) return jsonError('invalid_request', 400, undefined, requestId);
    if (!mintIsReady()) return jsonError('temporarily_unavailable', 503, OAUTH_SETUP_CHECKLIST, requestId);
    const redeemed = await redeemOauthCode({
      code: refresh,
      clientId,
      kind: 'refresh_token',
      mintReady: true,
      requestId,
    });
    if (!redeemed.ok) {
      if (redeemed.error === 'temporarily_unavailable') {
        return jsonError(
          'temporarily_unavailable',
          503,
          redeemed.description || OAUTH_SETUP_CHECKLIST,
          redeemed.diagnostic.requestId,
        );
      }
      return jsonError('invalid_grant', 400, undefined, redeemed.diagnostic.requestId);
    }
    const minted = await mintTokens({
      tenantId: redeemed.row.tenantId,
      userId: redeemed.row.userId,
      clientId: redeemed.row.clientId,
      connectionId: redeemed.row.connectionId,
      scopes: redeemed.row.scopes,
      redirectUri: redeemed.row.redirectUri,
    });
    if ('error' in minted) return withRequestId(minted.error, redeemed.diagnostic.requestId);
    return withRequestId(NextResponse.json(minted.body), redeemed.diagnostic.requestId);
  }

  if (grant !== 'authorization_code') {
    return jsonError('unsupported_grant_type', 400, undefined, requestId);
  }
  const code = String(body.get('code') ?? '').trim();
  const verifier = String(body.get('code_verifier') ?? '').trim();
  const redirectUri = String(body.get('redirect_uri') ?? '').trim();
  const tenantHint = String(body.get('tenant_id') ?? process.env.AGENT_BRIDGE_OAUTH_TENANT_HINT ?? '').trim();
  if (!code || !verifier || !clientId || !redirectUri) {
    return jsonError('invalid_request', 400, undefined, requestId);
  }
  if (!mintIsReady()) return jsonError('temporarily_unavailable', 503, OAUTH_SETUP_CHECKLIST, requestId);
  const redeemed = await redeemOauthCode({
    code,
    clientId,
    redirectUri,
    codeVerifier: verifier,
    tenantHint: tenantHint || undefined,
    kind: 'authorization_code',
    mintReady: true,
    requestId,
  });
  if (!redeemed.ok) {
    if (redeemed.error === 'temporarily_unavailable') {
      return jsonError(
        'temporarily_unavailable',
        503,
        redeemed.description || OAUTH_SETUP_CHECKLIST,
        redeemed.diagnostic.requestId,
      );
    }
    return jsonError('invalid_grant', 400, undefined, redeemed.diagnostic.requestId);
  }
  const minted = await mintTokens({
    tenantId: redeemed.row.tenantId,
    userId: redeemed.row.userId,
    clientId: redeemed.row.clientId,
    connectionId: redeemed.row.connectionId,
    scopes: redeemed.row.scopes,
    redirectUri: redeemed.row.redirectUri,
  });
  if ('error' in minted) return withRequestId(minted.error, redeemed.diagnostic.requestId);
  return withRequestId(NextResponse.json(minted.body), redeemed.diagnostic.requestId);
}
