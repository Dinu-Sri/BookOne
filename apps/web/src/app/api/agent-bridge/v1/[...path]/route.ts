import { NextRequest, NextResponse } from 'next/server';
import {
  dispatchTool,
  rateLimit,
  resolveActorFromAuthorization,
} from '@bookone/agent-bridge';
import { agentBridgeTokenSecret, getAgentBridgeServiceForActor } from '@/lib/agent-bridge-runtime';

export const runtime = 'nodejs';

async function serviceForActor(actor: Parameters<typeof getAgentBridgeServiceForActor>[0]) {
  return getAgentBridgeServiceForActor(actor);
}

function jsonError(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, code, error }, { status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const actor = await resolveActorFromAuthorization(
      req.headers.get('authorization'),
      agentBridgeTokenSecret(),
      process.env,
    );
    if (!rateLimit(`${actor.tenantId}:${actor.clientId ?? actor.userId}`)) {
      return jsonError(429, 'PERMISSION_DENIED', 'Rate limit exceeded.');
    }
    const { path } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const service = await serviceForActor(actor);
    const route = (path ?? []).join('/');
    const tool =
      route === 'documents' ? 'submit_document'
      : route === 'facts' ? 'submit_extracted_facts'
      : route === 'upload-sessions' ? 'create_upload_session'
      : route === 'upload-sessions/finalize' ? 'finalize_upload_session'
      : route === 'batches' ? 'submit_batch_manifest'
      : route === 'drafts' ? 'update_draft'
      : route === 'answers' ? 'answer_issue'
      : route === 'preview' ? 'get_preview'
      : route === 'approvals' ? 'grant_approval'
      : route === 'commit' ? 'commit_approved_proposal'
      : route === 'validate' ? 'validate_proposal'
      : null;
    if (!tool) return jsonError(404, 'STALE_REVISION', 'Unknown AgentBridge route.');
    const result = await dispatchTool(service, actor, tool, body);
    return NextResponse.json(result);
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === 'PERMISSION_DENIED' ? 403 : 400;
    return jsonError(status, err.code ?? 'FAILED', err.message);
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const actor = await resolveActorFromAuthorization(
      req.headers.get('authorization'),
      agentBridgeTokenSecret(),
      process.env,
    );
    if (!rateLimit(`${actor.tenantId}:${actor.clientId ?? actor.userId}`)) {
      return jsonError(429, 'PERMISSION_DENIED', 'Rate limit exceeded.');
    }
    const { path } = await ctx.params;
    const service = await serviceForActor(actor);
    const route = (path ?? []).join('/');
    if (route === 'capabilities') {
      return NextResponse.json(await service.getCapabilities(actor));
    }
    if (route === 'policy') {
      return NextResponse.json(await service.getPolicyContext(actor));
    }
    if (route.startsWith('documents/')) {
      const id = route.slice('documents/'.length);
      return NextResponse.json(await service.getProcessingStatus(actor, id));
    }
    if (route.startsWith('operations/')) {
      const id = route.slice('operations/'.length);
      return NextResponse.json(await service.getOperationStatus(actor, id));
    }
    if (route === 'documents') {
      return NextResponse.json(await service.listInbox(actor));
    }
    if (route === 'suppliers') {
      const q = req.nextUrl.searchParams.get('q') ?? undefined;
      return NextResponse.json(await service.lookupSuppliers(actor, { q }));
    }
    if (route === 'expense-accounts') {
      const q = req.nextUrl.searchParams.get('q') ?? undefined;
      return NextResponse.json(await service.lookupExpenseAccounts(actor, { q }));
    }
    if (route === 'proposals') {
      return NextResponse.json(await service.listOwnProposals(actor));
    }
    if (route.startsWith('batches/')) {
      return NextResponse.json(await service.getBatchStatus(actor, route.slice('batches/'.length)));
    }
    return jsonError(404, 'STALE_REVISION', 'Unknown AgentBridge route.');
  } catch (e) {
    const err = e as Error & { code?: string };
    const status = err.code === 'PERMISSION_DENIED' ? 403 : 400;
    return jsonError(status, err.code ?? 'FAILED', err.message);
  }
}
