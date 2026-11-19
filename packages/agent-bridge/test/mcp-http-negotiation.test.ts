import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  handleMcpHttpPost,
  MCP_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_HEADER,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  SCHEMA_VERSION,
  defaultPolicy,
  mintLocalFixtureToken,
  resolveActorFromAuthorization,
  type Actor,
} from '../src/index';
import { MemoryStore } from '../src/store';
import { AgentBridgeService, recordingPostingPort, TOOL_NAMES } from '../src/service';
import { fixtureExtractor } from '../src/extraction';

const requireFromWeb = createRequire(path.resolve(__dirname, '../../../apps/web/package.json'));
const { NextRequest } = requireFromWeb('next/dist/server/web/spec-extension/request.js') as {
  NextRequest: new (input: string | URL, init?: RequestInit) => Request & { nextUrl: URL; url: string };
};

const SECRET = 'mcp-http-negotiation-secret';
const ORIGIN = 'https://bookone.clossyan.com';
const MCP_PATH = '/api/agent-bridge/mcp';

function actorScopes(): Actor['capabilities'] {
  return ['read', 'upload', 'draft'];
}

async function service() {
  const store = new MemoryStore();
  await store.setFlags('t1', { enabled: true, draftOnly: false, postingDisabled: true });
  return new AgentBridgeService({
    store,
    extractor: fixtureExtractor,
    posting: recordingPostingPort(),
    policyFor: async () => defaultPolicy(),
  });
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('server did not bind'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function nextRequestFromNode(req: IncomingMessage, raw: Buffer): Request & { nextUrl: URL; url: string } {
  const target = req.url || '/';
  const url = target.startsWith('http') ? new URL(target) : new URL(target, ORIGIN);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  return new NextRequest(url, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : raw,
  });
}

const LIVE_CODEX_INITIALIZE = {
  jsonrpc: '2.0',
  id: 0,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'codex_cli', title: 'Codex', version: '0.167.0-alpha.4.1' },
  },
};

describe('AB-11 Streamable HTTP MCP protocol negotiation', () => {
  let server: Server;
  let origin = '';
  let token = '';
  let svc: AgentBridgeService;

  beforeAll(async () => {
    svc = await service();
    token = mintLocalFixtureToken({
      tenantId: 't1',
      userId: 'u1',
      scopes: actorScopes(),
      secret: SECRET,
    });
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk as Buffer));
      req.on('end', () => {
        void (async () => {
          const raw = Buffer.concat(chunks);
          const nextReq = nextRequestFromNode(req, raw);
          try {
            const actor = await resolveActorFromAuthorization(
              nextReq.headers.get('authorization'),
              SECRET,
              { NODE_ENV: 'test', AUTH_SECRET: SECRET },
            );
            if (req.method === 'GET') {
              res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' });
              res.end();
              return;
            }
            let body: unknown = null;
            if (raw.length) {
              body = await nextReq.json();
            }
            const outcome = await handleMcpHttpPost({
              protocolVersionHeader: nextReq.headers.get(MCP_PROTOCOL_VERSION_HEADER),
              body,
              service: svc,
              actor,
            });
            res.writeHead(outcome.status, outcome.headers);
            res.end(outcome.json === null ? undefined : JSON.stringify(outcome.json));
          } catch (e) {
            const err = e as Error;
            res.writeHead(401, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: err.message } }));
          }
        })();
      });
    });
    origin = await listen(server);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function mcpFetch(body: unknown, extra: Record<string, string> = {}, method = 'POST') {
    return fetch(`${origin}${MCP_PATH}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...extra,
      },
      body: method === 'GET' ? undefined : JSON.stringify(body),
    });
  }

  it('reproduces the live Codex initialize 2025-06-18 through NextRequest HTTP', async () => {
    const res = await mcpFetch(LIVE_CODEX_INITIALIZE);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get(MCP_PROTOCOL_VERSION_HEADER)).toBe('2025-06-18');
    const json = (await res.json()) as {
      error?: { code: number; message: string; data?: { code?: string } };
      result?: {
        protocolVersion: string;
        capabilities: Record<string, unknown>;
        serverInfo: { name: string; version: string };
      };
    };
    expect(json.error).toBeUndefined();
    expect(json.result?.protocolVersion).toBe('2025-06-18');
    expect(json.result?.serverInfo).toEqual({ name: 'bookone-agent-bridge', version: SCHEMA_VERSION });
    expect(json.result?.capabilities).toEqual({ tools: { listChanged: false } });
    expect(Object.keys(json.result?.capabilities ?? {})).toEqual(['tools']);
    expect(json.result?.capabilities).not.toHaveProperty('resources');
    expect(json.result?.capabilities).not.toHaveProperty('prompts');
    expect(json.result?.capabilities).not.toHaveProperty('logging');
    expect(json.result?.capabilities).not.toHaveProperty('elicitation');
  });

  it('echoes older supported versions and negotiates unknown ones', async () => {
    for (const version of MCP_SUPPORTED_PROTOCOL_VERSIONS) {
      const res = await mcpFetch({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 't', version: '0' } },
      });
      const json = (await res.json()) as { result: { protocolVersion: string } };
      expect(res.status).toBe(200);
      expect(json.result.protocolVersion).toBe(version);
    }
    const unknown = await mcpFetch({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { protocolVersion: '1999-01-01', capabilities: {}, clientInfo: { name: 't', version: '0' } },
    });
    const negotiated = (await unknown.json()) as { result?: { protocolVersion: string }; error?: unknown };
    expect(unknown.status).toBe(200);
    expect(negotiated.error).toBeUndefined();
    expect(negotiated.result?.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
  });

  it('treats missing protocolVersion as the latest supported and malformed as Invalid params', async () => {
    const missing = await mcpFetch({ jsonrpc: '2.0', id: 3, method: 'initialize', params: { capabilities: {} } });
    const missingJson = (await missing.json()) as { result: { protocolVersion: string } };
    expect(missing.status).toBe(200);
    expect(missingJson.result.protocolVersion).toBe('2025-06-18');

    const malformed = await mcpFetch({
      jsonrpc: '2.0',
      id: 4,
      method: 'initialize',
      params: { protocolVersion: 20250618 },
    });
    const malformedJson = (await malformed.json()) as { error?: { code: number; data?: { code?: string } } };
    expect(malformed.status).toBe(200);
    expect(malformedJson.error?.code).toBe(-32602);
    expect(malformedJson.error?.data?.code).toBe('INVALID_PARAMS');
  });

  it('accepts notifications/initialized with HTTP 202 and no body', async () => {
    const res = await mcpFetch({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('lists tools and answers read-only calls after initialize', async () => {
    await mcpFetch(LIVE_CODEX_INITIALIZE);
    const initialized = await mcpFetch(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { [MCP_PROTOCOL_VERSION_HEADER]: '2025-06-18' },
    );
    expect(initialized.status).toBe(202);

    const listed = await mcpFetch(
      { jsonrpc: '2.0', id: 5, method: 'tools/list' },
      { [MCP_PROTOCOL_VERSION_HEADER]: '2025-06-18' },
    );
    expect(listed.status).toBe(200);
    const listJson = (await listed.json()) as { result: { tools: { name: string }[] } };
    const names = listJson.result.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([...TOOL_NAMES]));
    expect(names).toContain('get_capabilities');
    expect(names).toContain('get_policy_context');

    const caps = await mcpFetch(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_capabilities', arguments: {} } },
      { [MCP_PROTOCOL_VERSION_HEADER]: '2025-06-18' },
    );
    const capsJson = (await caps.json()) as {
      result: { structuredContent: { capabilities: string[]; flags: { postingDisabled: boolean } } };
    };
    expect(capsJson.result.structuredContent.capabilities).toEqual(['read', 'upload', 'draft']);
    expect(capsJson.result.structuredContent.flags.postingDisabled).toBe(true);

    const policy = await mcpFetch(
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_policy_context', arguments: {} } },
      { [MCP_PROTOCOL_VERSION_HEADER]: '2025-06-18' },
    );
    const policyJson = (await policy.json()) as { result: { structuredContent: { jurisdiction: string; currency: string } } };
    expect(policyJson.result.structuredContent.jurisdiction).toBe('LK');
    expect(policyJson.result.structuredContent.currency).toBe('LKR');
  });

  it('assumes 2025-03-26 when MCP-Protocol-Version is missing and 400s an unsupported header', async () => {
    const missingHeader = await mcpFetch({ jsonrpc: '2.0', id: 8, method: 'tools/list' });
    expect(missingHeader.status).toBe(200);
    expect(missingHeader.headers.get(MCP_PROTOCOL_VERSION_HEADER)).toBe('2025-03-26');

    const bad = await mcpFetch(
      { jsonrpc: '2.0', id: 9, method: 'tools/list' },
      { [MCP_PROTOCOL_VERSION_HEADER]: '1999-01-01' },
    );
    expect(bad.status).toBe(400);
    const badJson = (await bad.json()) as { error?: { code: number; data?: { code?: string } } };
    expect(badJson.error?.code).toBe(-32602);
    expect(badJson.error?.data?.code).toBe('UNSUPPORTED_PROTOCOL');
  });

  it('refuses JSON-RPC batches, unknown resource methods, and unauthenticated initialize', async () => {
    const batch = await mcpFetch([LIVE_CODEX_INITIALIZE, { jsonrpc: '2.0', id: 1, method: 'ping' }]);
    expect(batch.status).toBe(400);

    const resources = await mcpFetch({ jsonrpc: '2.0', id: 10, method: 'resources/list' });
    const resourcesJson = (await resources.json()) as { error?: { code: number } };
    expect(resources.status).toBe(200);
    expect(resourcesJson.error?.code).toBe(-32601);

    const prompts = await mcpFetch({ jsonrpc: '2.0', id: 11, method: 'prompts/list' });
    expect(((await prompts.json()) as { error?: { code: number } }).error?.code).toBe(-32601);

    const anon = await fetch(`${origin}${MCP_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(LIVE_CODEX_INITIALIZE),
    });
    expect(anon.status).toBe(401);
  });

  it('allows repeated initialize and out-of-order tools/list, and 405s authenticated GET', async () => {
    const first = await mcpFetch(LIVE_CODEX_INITIALIZE);
    const second = await mcpFetch(LIVE_CODEX_INITIALIZE);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const earlyList = await mcpFetch({ jsonrpc: '2.0', id: 12, method: 'tools/list' });
    expect(earlyList.status).toBe(200);

    const get = await mcpFetch(undefined, {}, 'GET');
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
  });

  it('keeps NextRequest header lookup case-insensitive for MCP-Protocol-Version', () => {
    const req = new NextRequest(`${ORIGIN}${MCP_PATH}`, {
      method: 'POST',
      headers: { 'MCP-Protocol-Version': '2025-06-18', authorization: `Bearer ${token}` },
      body: JSON.stringify(LIVE_CODEX_INITIALIZE),
    });
    expect(req.headers.get('mcp-protocol-version')).toBe('2025-06-18');
    expect(req.headers.get(MCP_PROTOCOL_VERSION_HEADER)).toBe('2025-06-18');
  });
});
