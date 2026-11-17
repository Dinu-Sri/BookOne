import { NextRequest, NextResponse } from 'next/server';
import { resolveActorFromAuthorization } from '@bookone/agent-bridge';
import { agentBridgeTokenSecret, revokeAgentBridgeConnection } from '@/lib/agent-bridge-runtime';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActorFromAuthorization(
      req.headers.get('authorization'),
      agentBridgeTokenSecret(),
      process.env,
    );
    if (actor.connectionId) {
      await revokeAgentBridgeConnection(actor.tenantId, actor.userId, actor.connectionId);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
