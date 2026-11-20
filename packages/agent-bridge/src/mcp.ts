import {
  MCP_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_HEADER,
  MCP_PROTOCOL_VERSION_WHEN_HEADER_MISSING,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  SCHEMA_VERSION,
  type Actor,
  type ProposalFacts,
} from './contracts';
import { actorFromToken, resolveActorFromAuthorization, verifyConnectionToken } from './authz';
import { AgentBridgeService, TOOL_NAMES, toolsForActor } from './service';
import { TOOL_INPUT_SCHEMAS, validateAgainstSchema } from './schemas';
import { money } from './money';

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

const TOOL_DESCRIPTIONS: Record<string, string> = {
  get_capabilities: 'List AgentBridge flags, scopes, operations and tools for this connection.',
  get_policy_context: 'Return the company purchase-bill policy in force.',
  submit_document: 'Upload an owned PDF or image. Pass filename, mime and contentBase64. Never a filesystem path or URL.',
  submit_extracted_facts:
    'Submit structured invoice facts against an owned stored document, content hash and expected revision. Works without server OCR.',
  create_upload_session:
    'Create a short-lived upload session and an authenticated BookOne review URL when the chat client cannot forward file bytes.',
  finalize_upload_session: 'Finalize an upload session with contentBase64 after the original bytes are available.',
  submit_batch_manifest: 'Submit one manifest item per file. Items are reviewed separately. Never a batch approval.',
  get_batch_status: 'Read per-item batch status.',
  lookup_suppliers: 'Search approved suppliers in this company. Returns name and partyId only.',
  lookup_expense_accounts: 'Search approved expense accounts in this company.',
  list_own_proposals: 'List the caller’s own documents and proposals.',
  get_processing_status: 'Read document status, issues and allowed next actions.',
  propose_purchase_bill: 'Return the current proposal for a document.',
  update_draft: 'Patch proposal facts with expectedRevision optimistic concurrency.',
  validate_proposal: 'Re-run issue detection on the current revision.',
  answer_issue: 'Answer one clarification question in plain language.',
  get_preview: 'Server-calculated unpaid service bill preview. Does not post.',
  request_approval: 'Move a validated proposal into awaiting-approval.',
  grant_approval: 'Human-only grant bound to the current proposal hash. Agents cannot call this.',
  commit_approved_proposal: 'Post once with a durable idempotency key.',
  get_operation_status: 'Read a commit operation without retrying.',
  get_receipt: 'Read the durable receipt for a finished operation.',
  list_commerce_connections:
    'List eligible BookOne Commerce store connections. Does not return API keys. Requires commerce_read.',
  list_bookone_catalog: 'Search sellable BookOne products and variants for mapping. Requires commerce_read.',
  get_mapping_summary: 'Read current SKU mappings for one Commerce connection. Requires commerce_read.',
  preview_mapping_proposal:
    'Preview and store a mapping proposal from sanitized store identities. SKU is a search aid. Apply stays in the BookOne UI. Requires commerce_propose.',
};

export function mcpToolsList() {
  return TOOL_NAMES.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    inputSchema: TOOL_INPUT_SCHEMAS[name] ?? { type: 'object', additionalProperties: false, properties: {} },
  }));
}

export function mcpToolsListForActor(actor: Actor) {
  return toolsForActor(actor).map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name] ?? name,
    inputSchema: TOOL_INPUT_SCHEMAS[name] ?? { type: 'object', additionalProperties: false, properties: {} },
  }));
}

function factsPatch(args: Record<string, unknown>): Partial<ProposalFacts> {
  const patch: Partial<ProposalFacts> = {};
  if (typeof args.supplierName === 'string') patch.supplierName = args.supplierName;
  if (typeof args.supplierInvoiceNumber === 'string') patch.supplierInvoiceNumber = args.supplierInvoiceNumber;
  if (typeof args.issueDate === 'string') patch.issueDate = args.issueDate;
  if (typeof args.currency === 'string') patch.currency = args.currency;
  if (typeof args.paidStatus === 'string') patch.paidStatus = args.paidStatus as ProposalFacts['paidStatus'];
  if (typeof args.documentKind === 'string') patch.documentKind = args.documentKind as ProposalFacts['documentKind'];
  if (typeof args.expenseAccountCode === 'string') patch.expenseAccountCode = args.expenseAccountCode;
  if (typeof args.categoryLabel === 'string') patch.categoryLabel = args.categoryLabel;
  if (typeof args.lineDescription === 'string') patch.lineDescription = args.lineDescription;
  const currency = typeof args.currency === 'string' ? args.currency : undefined;
  if (typeof args.netMinor === 'number') patch.net = money(args.netMinor, currency);
  if (typeof args.taxMinor === 'number') patch.tax = money(args.taxMinor, currency);
  if (typeof args.grossMinor === 'number') patch.gross = money(args.grossMinor, currency);
  return patch;
}

export async function dispatchTool(
  service: AgentBridgeService,
  actor: Actor,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const schema = TOOL_INPUT_SCHEMAS[name];
  if (schema) {
    const checked = validateAgainstSchema(schema, args ?? {});
    if (!checked.ok) return { ok: false, code: 'STALE_REVISION', error: checked.error };
    args = checked.value as Record<string, unknown>;
  }
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
      let bytes: Uint8Array;
      try {
        const buf = Buffer.from(b64, 'base64');
        if (!buf.byteLength) return { ok: false, code: 'ATTACHMENT_REJECTED', error: 'contentBase64 is empty or malformed.' };
        bytes = new Uint8Array(buf);
      } catch {
        return { ok: false, code: 'ATTACHMENT_REJECTED', error: 'contentBase64 is not valid base64.' };
      }
      return service.submitDocument(actor, {
        filename,
        mime,
        bytes,
        textHint: args.textHint ? String(args.textHint) : undefined,
        idempotencyKey: args.idempotencyKey ? String(args.idempotencyKey) : undefined,
      });
    }
    case 'submit_extracted_facts':
      return service.submitExtractedFacts(actor, {
        documentId: String(args.documentId ?? ''),
        contentHash: String(args.contentHash ?? ''),
        expectedRevision: Number(args.expectedRevision ?? 0),
        idempotencyKey: args.idempotencyKey ? String(args.idempotencyKey) : undefined,
        supplierName: args.supplierName ? String(args.supplierName) : undefined,
        supplierInvoiceNumber: args.supplierInvoiceNumber ? String(args.supplierInvoiceNumber) : undefined,
        issueDate: args.issueDate ? String(args.issueDate) : undefined,
        currency: args.currency ? String(args.currency) : undefined,
        paidStatus: args.paidStatus as never,
        documentKind: args.documentKind as never,
        netMinor: typeof args.netMinor === 'number' ? args.netMinor : undefined,
        taxMinor: typeof args.taxMinor === 'number' ? args.taxMinor : undefined,
        grossMinor: typeof args.grossMinor === 'number' ? args.grossMinor : undefined,
        expenseAccountCode: args.expenseAccountCode ? String(args.expenseAccountCode) : undefined,
        categoryLabel: args.categoryLabel ? String(args.categoryLabel) : undefined,
        lineDescription: args.lineDescription ? String(args.lineDescription) : undefined,
        origin: 'agent-facts',
      });
    case 'create_upload_session':
      return service.createUploadSession(actor, {
        filename: String(args.filename ?? ''),
        mime: String(args.mime ?? ''),
        declaredBytes: typeof args.declaredBytes === 'number' ? args.declaredBytes : undefined,
        contentHash: args.contentHash ? String(args.contentHash) : undefined,
        requestKey: args.requestKey ? String(args.requestKey) : undefined,
      });
    case 'finalize_upload_session':
      return service.finalizeUploadSession(actor, {
        sessionId: String(args.sessionId ?? ''),
        contentBase64: args.contentBase64 ? String(args.contentBase64) : undefined,
      });
    case 'submit_batch_manifest':
      return service.submitBatchManifest(actor, {
        items: (args.items as never) ?? [],
      });
    case 'get_batch_status':
      return service.getBatchStatus(actor, String(args.batchId ?? ''));
    case 'lookup_suppliers':
      return service.lookupSuppliers(actor, {
        q: args.q ? String(args.q) : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
    case 'lookup_expense_accounts':
      return service.lookupExpenseAccounts(actor, {
        q: args.q ? String(args.q) : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
    case 'list_own_proposals':
      return service.listOwnProposals(actor, {
        q: args.q ? String(args.q) : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
    case 'get_processing_status':
      return service.getProcessingStatus(actor, String(args.documentId ?? ''));
    case 'propose_purchase_bill':
      return service.proposePurchaseBill(actor, String(args.documentId ?? ''));
    case 'update_draft':
      return service.updateDraft(actor, {
        proposalId: String(args.proposalId ?? ''),
        expectedRevision: Number(args.expectedRevision ?? 0),
        patch: factsPatch(args),
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
    case 'list_commerce_connections':
      return service.listCommerceConnections(actor);
    case 'list_bookone_catalog':
      return service.listBookoneCatalog(actor, args.q ? String(args.q) : undefined);
    case 'get_mapping_summary':
      return service.getMappingSummary(actor, String(args.connectionId ?? ''));
    case 'preview_mapping_proposal':
      return service.previewMappingProposal(actor, {
        connectionId: String(args.connectionId ?? ''),
        observations: (args.observations as never) ?? [],
      });
    default:
      return { ok: false, code: 'STALE_REVISION', error: `Unknown tool ${name}.` };
  }
}

function isSupportedProtocolVersion(value: string): boolean {
  return (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(value);
}

/**
 * MCP 2025-06-18 lifecycle: echo a supported requested version; otherwise return
 * the latest version this server actually implements. Unknown versions are not
 * Invalid params. Malformed (non-string) protocolVersion stays Invalid params.
 */
export function negotiateProtocolVersion(
  requested: unknown,
): { ok: true; version: string } | { ok: false; error: string } {
  if (requested === undefined || requested === null || requested === '') {
    return { ok: true, version: MCP_PROTOCOL_VERSION };
  }
  if (typeof requested !== 'string') {
    return { ok: false, error: 'protocolVersion must be a string.' };
  }
  if (isSupportedProtocolVersion(requested)) {
    return { ok: true, version: requested };
  }
  return { ok: true, version: MCP_PROTOCOL_VERSION };
}

export function readMcpProtocolVersionHeader(
  header: string | null | undefined,
): { ok: true; version: string; assumed: boolean } | { ok: false; error: string } {
  if (header === undefined || header === null || header.trim() === '') {
    return { ok: true, version: MCP_PROTOCOL_VERSION_WHEN_HEADER_MISSING, assumed: true };
  }
  const value = header.trim();
  if (isSupportedProtocolVersion(value)) {
    return { ok: true, version: value, assumed: false };
  }
  return {
    ok: false,
    error: `Unsupported MCP-Protocol-Version ${value}. Supported: ${MCP_SUPPORTED_PROTOCOL_VERSIONS.join(', ')}.`,
  };
}

export function isJsonRpcNotification(body: JsonRpcRequest): boolean {
  return !Object.prototype.hasOwnProperty.call(body, 'id') || body.id === undefined;
}

export type McpHttpResult = {
  status: number;
  headers: Record<string, string>;
  json: JsonRpcResponse | null;
};

function jsonHeaders(protocolVersion?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  };
  if (protocolVersion) headers[MCP_PROTOCOL_VERSION_HEADER] = protocolVersion;
  return headers;
}

function emptyAcceptedHeaders(): Record<string, string> {
  return { 'cache-control': 'no-store' };
}

/**
 * Streamable HTTP POST: JSON-RPC requests return application/json;
 * notifications return HTTP 202 with no body; JSON-RPC batches are refused;
 * an unsupported MCP-Protocol-Version header is HTTP 400.
 */
export async function handleMcpHttpPost(input: {
  protocolVersionHeader?: string | null;
  body: unknown;
  service: AgentBridgeService;
  actor: Actor;
}): Promise<McpHttpResult> {
  if (Array.isArray(input.body)) {
    return {
      status: 400,
      headers: jsonHeaders(),
      json: {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'JSON-RPC batching is not supported.' },
      },
    };
  }
  if (input.body === null || typeof input.body !== 'object') {
    return {
      status: 400,
      headers: jsonHeaders(),
      json: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC request.' } },
    };
  }
  const rpc = input.body as JsonRpcRequest;
  const method = typeof rpc.method === 'string' ? rpc.method : '';
  const headerCheck = readMcpProtocolVersionHeader(input.protocolVersionHeader);
  if (!headerCheck.ok) {
    return {
      status: 400,
      headers: jsonHeaders(),
      json: {
        jsonrpc: '2.0',
        id: rpc.id ?? null,
        error: { code: -32602, message: headerCheck.error, data: { code: 'UNSUPPORTED_PROTOCOL' } },
      },
    };
  }
  if (isJsonRpcNotification(rpc)) {
    return { status: 202, headers: emptyAcceptedHeaders(), json: null };
  }
  const result = await handleMcpJsonRpc({ body: rpc, service: input.service, actor: input.actor });
  const negotiated =
    method === 'initialize' && result.result && typeof result.result === 'object'
      ? String((result.result as { protocolVersion?: string }).protocolVersion ?? headerCheck.version)
      : headerCheck.version;
  return {
    status: 200,
    headers: jsonHeaders(negotiated),
    json: result,
  };
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
      const negotiated = negotiateProtocolVersion(input.body.params?.protocolVersion);
      if (!negotiated.ok) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: negotiated.error, data: { code: 'INVALID_PARAMS' } },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: negotiated.version,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'bookone-agent-bridge', version: SCHEMA_VERSION },
        },
      };
    }
    if (method === 'notifications/initialized' || method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }
    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: mcpToolsListForActor(input.actor) } };
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
