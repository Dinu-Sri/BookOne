import { NextRequest, NextResponse } from 'next/server';
import {
  handleMcpJsonRpc,
  rateLimit,
  resolveActorFromAuthorization,
  type JsonRpcRequest,
} from '@bookone/agent-bridge';
import { agentBridgeTokenSecret, getAgentBridgeServiceForActor } from '@/lib/agent-bridge-runtime';

export const runtime = 'nodejs';

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
    const body = (await req.json()) as JsonRpcRequest;
    const result = await handleMcpJsonRpc({ body, service, actor });
    return NextResponse.json(result);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === 'PERMISSION_DENIED' ? 401 : 400;
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: err.message } },
      { status },
    );
  }
}
