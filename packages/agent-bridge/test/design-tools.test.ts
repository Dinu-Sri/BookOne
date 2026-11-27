import { describe, expect, it } from 'vitest';
import { defaultPolicy, type Actor } from '../src/contracts';
import { MemoryStore } from '../src/store';
import {
  AgentBridgeService,
  DESIGN_READ_TOOL_NAMES,
  DESIGN_WRITE_TOOL_NAMES,
  TOOL_NAMES,
  recordingPostingPort,
  toolsForActor,
  type PrintDesignPort,
} from '../src/service';
import { fixtureExtractor } from '../src/extraction';
import { handleMcpJsonRpc } from '../src/mcp';
import { parseRequestedScopes } from '../src/oauth';
import { parseScopes } from '../src/authz';

function actor(capabilities: Actor['capabilities'], clientId = 'bookone-claude'): Actor {
  return { userId: 'u1', tenantId: 't1', connectionId: 'conn-1', clientId, capabilities };
}

function port(calls: Array<{ method: string; input: unknown }>): PrintDesignPort {
  const rec = (method: string) => async (input: unknown) => {
    calls.push({ method, input });
    return { ok: true, method };
  };
  return {
    listItems: rec('listItems'),
    guide: async (_t, kind) => rec('guide')(kind),
    listDesigns: async (_t, kind) => rec('listDesigns')(kind),
    getDesign: async (_t, id) => rec('getDesign')(id),
    assets: rec('assets'),
    create: rec('create'),
    saveVersion: rec('saveVersion'),
    requestApproval: rec('requestApproval'),
  };
}

async function svc(enabled = true, calls: Array<{ method: string; input: unknown }> = []) {
  const store = new MemoryStore();
  await store.setFlags('t1', { enabled, draftOnly: true, postingDisabled: true });
  return new AgentBridgeService({
    store,
    extractor: fixtureExtractor,
    posting: recordingPostingPort(),
    printDesigns: port(calls),
    policyFor: async () => defaultPolicy(),
  });
}

async function call(service: AgentBridgeService, a: Actor, name: string, args: Record<string, unknown> = {}) {
  return handleMcpJsonRpc({ body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, service, actor: a });
}

const DESIGN = JSON.stringify({ schema: 'bookone.print-design.v1', blocks: [] });

describe('AgentBridge print design tools', () => {
  it('are listed only with the print design ability, and there is no delete, approve or use tool', async () => {
    expect(toolsForActor(actor(['read', 'upload', 'draft']))).toEqual([...TOOL_NAMES]);
    const reader = toolsForActor(actor(['read', 'design_read']));
    expect(reader).toEqual(expect.arrayContaining([...DESIGN_READ_TOOL_NAMES]));
    expect(reader).not.toContain('create_print_design');
    const writer = toolsForActor(actor(['read', 'design_read', 'design_write']));
    expect(writer).toEqual(expect.arrayContaining([...DESIGN_WRITE_TOOL_NAMES]));
    for (const name of writer) expect(name).not.toMatch(/delete|remove|approve_print|use_print|activate/);
  });

  it('refuses tools without the capability and when assistants are off for the company', async () => {
    const service = await svc(true);
    const denied = await call(service, actor(['read']), 'list_print_items');
    expect(denied.error?.code).toBe(-32001);
    const off = await svc(false);
    const r = await call(off, actor(['read', 'design_read']), 'list_print_items');
    const structured = (r.result as { structuredContent?: { code?: string } } | undefined)?.structuredContent;
    expect(structured?.code ?? r.error?.message).toMatch(/FEATURE_DISABLED|off/);
  });

  it('passes the assistant name and the design JSON through to BookOne, which saves drafts only', async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const service = await svc(true, calls);
    const writer = actor(['read', 'design_read', 'design_write']);
    await call(service, writer, 'create_print_design', { kind: 'tax_invoice', name: 'Copy of photo', designJson: DESIGN });
    await call(service, writer, 'save_print_design_version', { basedOnDesignId: 'd1', designJson: DESIGN, changeNote: 'Blue header' });
    await call(service, writer, 'request_print_design_approval', { designId: 'd1' });
    expect(calls.map((c) => c.method)).toEqual(['create', 'saveVersion', 'requestApproval']);
    expect(calls[0]!.input).toMatchObject({ kind: 'tax_invoice', agentLabel: 'Claude', connectionId: 'conn-1', designJson: DESIGN });
  });

  it('validates tool arguments strictly', async () => {
    const service = await svc(true);
    const writer = actor(['read', 'design_read', 'design_write']);
    const bad = await call(service, writer, 'create_print_design', { kind: 'letter', name: 'x', designJson: DESIGN });
    const s = (bad.result as { structuredContent?: { code?: string } }).structuredContent;
    expect(s?.code).toBe('INVALID_ARGUMENT');
    const extra = await call(service, writer, 'get_print_design', { designId: 'd1', approve: true });
    expect((extra.result as { structuredContent?: { code?: string } }).structuredContent?.code).toBe('INVALID_ARGUMENT');
  });

  it('maps job keys and requested scopes to the design capabilities', () => {
    expect(parseScopes(['agent_bridge.design_write'])).toEqual(expect.arrayContaining(['design_read', 'design_write']));
    expect(parseScopes(['agent_bridge.design_read'])).toEqual(['design_read']);
    expect(parseRequestedScopes('read design_write')).toEqual(expect.arrayContaining(['design_read', 'design_write']));
  });
});
