import { describe, expect, it } from 'vitest';
import { defaultPolicy, MCP_PROTOCOL_VERSION, type Actor } from '../src/contracts';
import { MemoryStore } from '../src/store';
import { AgentBridgeService, recordingPostingPort, TOOL_NAMES } from '../src/service';
import { fixtureExtractor } from '../src/extraction';
import { actorFromAuthorization, handleMcpJsonRpc, rateLimit } from '../src/mcp';
import { mintLocalFixtureToken } from '../src/authz';

const secret = 'mcp-test-secret';

function actor(): Actor {
  return {
    userId: 'u1',
    tenantId: 't1',
    capabilities: ['read', 'upload', 'draft', 'approve', 'post'],
  };
}

async function svc() {
  const store = new MemoryStore();
  await store.setFlags('t1', { enabled: true, draftOnly: false, postingDisabled: false });
  return new AgentBridgeService({
    store,
    extractor: fixtureExtractor,
    posting: recordingPostingPort(),
    policyFor: async () => defaultPolicy(),
  });
}

describe('MCP JSON-RPC adapter', () => {
  it('advertises the documented protocol and every required tool', async () => {
    const res = await handleMcpJsonRpc({
      body: { jsonrpc: '2.0', id: 1, method: 'initialize' },
      service: await svc(),
      actor: actor(),
    });
    expect(res.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'bookone-agent-bridge' },
    });
    expect(MCP_PROTOCOL_VERSION).toBe('2025-06-18');
    expect(Object.keys((res.result as { capabilities: object }).capabilities)).toEqual(['tools']);
    const tools = await handleMcpJsonRpc({
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      service: await svc(),
      actor: actor(),
    });
    const names = ((tools.result as { tools: { name: string }[] }).tools).map((t) => t.name);
    for (const n of TOOL_NAMES) expect(names).toContain(n);
  });

  it('submits through MCP without accepting a filesystem path', async () => {
    const service = await svc();
    const denied = await handleMcpJsonRpc({
      body: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'submit_document', arguments: { filePath: 'C\\\\secrets.pdf' } },
      },
      service,
      actor: actor(),
    });
    const structured = (denied.result as { structuredContent: { code?: string; error?: string } }).structuredContent;
    expect(structured.ok === false || structured.code === 'ATTACHMENT_REJECTED' || structured.error).toBeTruthy();
    expect(JSON.stringify(structured)).toMatch(/not a supported field|ATTACHMENT_REJECTED|paths and URLs/i);

    const bytes = Buffer.from('fixture:supported-vat-service').toString('base64');
    const ok = await handleMcpJsonRpc({
      body: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'submit_document',
          arguments: { filename: 'inv.pdf', mime: 'application/pdf', contentBase64: bytes },
        },
      },
      service,
      actor: actor(),
    });
    const submitted = (ok.result as { structuredContent: { ok: boolean } }).structuredContent;
    expect(submitted.ok).toBe(true);
  });

  it('rejects missing bearer tokens and rate-limits a noisy client', () => {
    expect(() => actorFromAuthorization(null, secret)).toThrow(/Missing Bearer/);
    const token = mintLocalFixtureToken({
      tenantId: 't1',
      userId: 'u1',
      scopes: ['read'],
      secret,
    });
    const a = actorFromAuthorization(`Bearer ${token}`, secret);
    expect(a.tenantId).toBe('t1');
    const key = 't1:noisy';
    for (let i = 0; i < 60; i++) expect(rateLimit(key, 60, 60_000, 1)).toBe(true);
    expect(rateLimit(key, 60, 60_000, 1)).toBe(false);
  });
});
