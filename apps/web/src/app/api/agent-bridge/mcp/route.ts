import { NextRequest, NextResponse } from 'next/server';
import {
  handleMcpHttpPost,
  rateLimit,
  resolveActorFromAuthorization,
  wwwAuthenticateChallenge,
} from '@bookone/agent-bridge';
import { agentBridgeTokenSecret, getAgentBridgeServiceForActor } from '@/lib/agent-bridge-runtime';

export const runtime = 'nodejs';

function originFrom(req: NextRequest): string {
  const env = process.env.AGENT_BRIDGE_PUBLIC_URL || process.env.AUTH_URL;
  if (env) return env.replace(/\/$/, '');
  return new URL(req.url).origin;
}

function unauthorized(req: NextRequest, message: string, error = 'invalid_token') {
  return NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message } },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': wwwAuthenticateChallenge(originFrom(req), { error, description: message }),
        'cache-control': 'no-store',
      },
    },
  );
}

export async function GET(req: NextRequest) {
  try {
    await resolveActorFromAuthorization(
      req.headers.get('authorization'),
      agentBridgeTokenSecret(),
      process.env,
    );
  } catch (e) {
    const err = e as Error;
    const missing = !req.headers.get('authorization');
    return unauthorized(req, err.message || 'Missing Bearer token.', missing ? 'invalid_request' : 'invalid_token');
  }
  return new NextResponse(null, {
    status: 405,
    headers: { allow: 'POST', 'cache-control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActorFromAuthorization(
      req.headers.get('authorization'),
      agentBridgeTokenSecret(),
      process.env,
    );
    if (!rateLimit(`mcp:${actor.tenantId}:${actor.connectionId ?? actor.userId}`)) {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Rate limit exceeded.' } },
        { status: 429 },
      );
    }
    const service = await getAgentBridgeServiceForActor(actor);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } },
        { status: 400, headers: { 'cache-control': 'no-store' } },
      );
    }
    const outcome = await handleMcpHttpPost({
      protocolVersionHeader: req.headers.get('mcp-protocol-version'),
      body,
      service,
      actor,
    });
    if (outcome.json === null) {
      return new NextResponse(null, { status: outcome.status, headers: outcome.headers });
    }
    return NextResponse.json(outcome.json, { status: outcome.status, headers: outcome.headers });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (
      err.code === 'PERMISSION_DENIED' ||
      err.code === 'TOKEN_INVALID' ||
      err.code === 'HMAC_DISABLED' ||
      err.code === 'CONNECTION_REVOKED'
    ) {
      return unauthorized(req, err.message, err.code === 'HMAC_DISABLED' ? 'invalid_token' : 'invalid_token');
    }
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: err.message } },
      { status: 400 },
    );
  }
}
