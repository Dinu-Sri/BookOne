import { MCP_PROTOCOL_VERSION, type Actor } from './contracts';
import { actorFromToken, resolveActorFromAuthorization, verifyConnectionToken } from './authz';
import { AgentBridgeService, TOOL_NAMES } from './service';

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const TOOL_DESCRIPTIONS: Record<(typeof TOOL_NAMES)[number], string> = {
  get_capabilities: 'List AgentBridge flags, scopes and tools for this connection.',
  get_policy_context: 'Return the company purchase-bill policy in force.',
  submit_document: 'Upload an owned PDF or image. Pass filename, mime and contentBase64. Never a filesystem path.',
  get_processing_status: 'Read document status, issues and allowed next actions.',
  propose_purchase_bill: 'Return the current proposal for a document.',
  update_draft: 'Patch proposal facts with expectedRevision optimistic concurrency.',
  validate_proposal: 'Re-run issue detection on the current revision.',
  answer_issue: 'Answer one clarification question in plain language.',
  get_preview: 'Server-calculated unpaid service bill preview. Does not post.',
  request_approval: 'Move a validated proposal into awaiting-approval.',
  grant_approval: 'Human-only grant bound to the current proposal hash.',
  commit_approved_proposal: 'Post once with a durable idempotency key.',
  get_operation_status: 'Read a commit operation without retrying.',
  get_receipt: 'Read the durable receipt for a finished operation.',
};

export function mcpToolsList() {
  return TOOL_NAMES.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    inputSchema: { type: 'object', additionalProperties: true },
  }));
}

export async function dispatchTool(
  service: AgentBridgeService,
  actor: Actor,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  switch (name) {
    case 'get_capabilities':
      return service.getCapabilities(actor);
    case 'get_policy_context':
      return service.getPolicyContext(actor);
    case 'submit_document': {
      const filename = String(args.filename ?? '');
      const mime = String(args.mime ?? '');
      const b64 = String(args.contentBase64 ?? '');
      if (args.filePath || args.path || args.url) {
        return { ok: false, code: 'ATTACHMENT_REJECTED', error: 'Arbitrary paths and URLs are not accepted.' };
      }
      const bytes = Buffer.from(b64, 'base64');
      return service.submitDocument(actor, {
        filename,
        mime,
        bytes: new Uint8Array(bytes),
        textHint: args.textHint ? String(args.textHint) : undefined,
      });
    }
    case 'get_processing_status':
      return service.getProcessingStatus(actor, String(args.documentId ?? ''));
    case 'propose_purchase_bill':
      return service.proposePurchaseBill(actor, String(args.documentId ?? ''));
    case 'update_draft':
      return service.updateDraft(actor, {
        proposalId: String(args.proposalId ?? ''),
        expectedRevision: Number(args.expectedRevision ?? 0),
        patch: (args.patch ?? {}) as never,
      });
    case 'validate_proposal':
      return service.validateProposal(actor, String(args.proposalId ?? ''));
    case 'answer_issue':
      return service.answerIssue(actor, {
        proposalId: String(args.proposalId ?? ''),
        issueId: String(args.issueId ?? ''),
        value: String(args.value ?? ''),
      });
    case 'get_preview':
      return service.getPreview(actor, String(args.proposalId ?? ''));
    case 'request_approval':
      return service.requestApproval(actor, String(args.proposalId ?? ''));
    case 'grant_approval':
      if (actor.connectionId) {
        return { ok: false, code: 'HUMAN_APPROVAL_REQUIRED', error: 'A connected agent cannot mint human approval.' };
      }
      return service.grantApproval(actor, String(args.proposalId ?? ''));
    case 'commit_approved_proposal':
      return service.commitApprovedProposal(actor, {
        proposalId: String(args.proposalId ?? ''),
        approvalId: String(args.approvalId ?? ''),
        idempotencyKey: String(args.idempotencyKey ?? ''),
      });
    case 'get_operation_status':
      return service.getOperationStatus(actor, String(args.operationId ?? ''));
    case 'get_receipt':
      return service.getReceipt(actor, String(args.operationId ?? ''));
    default:
      return { ok: false, code: 'STALE_REVISION', error: `Unknown tool ${name}.` };
  }
}

export async function handleMcpJsonRpc(input: {
  body: JsonRpcRequest;
  service: AgentBridgeService;
  actor: Actor;
}): Promise<JsonRpcResponse> {
  const id = input.body.id ?? null;
  const method = input.body.method ?? '';
  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'bookone-agent-bridge', version: 'ab-04.1' },
        },
      };
    }
    if (method === 'notifications/initialized' || method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }
    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: mcpToolsList() } };
    }
    if (method === 'tools/call') {
      const name = String(input.body.params?.name ?? '');
      const args = (input.body.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await dispatchTool(input.service, input.actor, name, args);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
          isError: Boolean(result && typeof result === 'object' && 'ok' in result && (result as { ok: boolean }).ok === false),
        },
      };
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method ${method}` } };
  } catch (e) {
    const err = e as Error & { code?: string };
    const permission = err.code === 'PERMISSION_DENIED';
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: permission ? -32001 : -32000,
        message: err.message,
        data: { code: err.code ?? 'FAILED' },
      },
    };
  }
}

const buckets = new Map<string, { n: number; reset: number }>();

export function rateLimit(key: string, limit = 60, windowMs = 60_000, now = Date.now()): boolean {
  const cur = buckets.get(key);
  if (!cur || cur.reset <= now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  if (cur.n >= limit) return false;
  cur.n += 1;
  return true;
}

export function actorFromAuthorization(header: string | null | undefined, secret: string, now = Date.now()): Actor {
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw Object.assign(new Error('Missing Bearer token.'), { code: 'PERMISSION_DENIED' });
  }
  const token = header.slice(7).trim();
  const payload = verifyConnectionToken(token, secret, now);
  return actorFromToken(payload);
}

export { resolveActorFromAuthorization };

export { MCP_PROTOCOL_VERSION };
