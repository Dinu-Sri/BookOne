import { describe, expect, it } from 'vitest';
import { defaultPolicy, type Actor } from '../src/contracts';
import { MemoryStore } from '../src/store';
import {
  AgentBridgeService,
  COMMERCE_PROPOSE_TOOL_NAMES,
  COMMERCE_READ_TOOL_NAMES,
  recordingPostingPort,
  TOOL_NAMES,
  toolsForActor,
} from '../src/service';
import { fixtureExtractor } from '../src/extraction';
import { handleMcpJsonRpc } from '../src/mcp';
import type { CommerceMappingPort } from '../src/service';

const secret = 'mcp-test-secret';
void secret;

function actor(capabilities: Actor['capabilities']): Actor {
  return { userId: 'u1', tenantId: 't1', connectionId: 'conn-1', capabilities };
}

function commercePort(): CommerceMappingPort {
  return {
    async listConnections() {
      return [{ id: 'c1', name: 'Pilot store', kind: 'woocommerce', locationId: 'loc', mappingCount: 1 }];
    },
    async listCatalog() {
      return [{ id: 'p1', sku: 'SKU-1', name: 'Pilot mug', unit: 'each', archived: false, sellPrice: '1500.00' }];
    },
    async mappingSummary() {
      return {
        connectionId: 'c1',
        connectionName: 'Pilot store',
        locationId: 'loc',
        mapped: 1,
        items: [
          {
            sku: 'SKU-1',
            bookoneProductId: 'p1',
            bookoneName: 'Pilot mug',
            externalProductId: 'woo-12',
            externalVariantId: '',
            status: 'active',
          },
        ],
      };
    },
    async previewProposal(input) {
      return {
        proposalId: 'prop-1',
        items: input.observations.map((row) => ({
          sku: row.sku ?? '',
          kind: 'suggested',
          reason: 'SKU match',
          bookoneProductId: 'p1',
          origin: row.origin,
        })),
      };
    },
  };
}

async function svc(capabilities: Actor['capabilities'] = ['read', 'upload', 'draft', 'commerce_read', 'commerce_propose']) {
  const store = new MemoryStore();
  await store.setFlags('t1', { enabled: true, draftOnly: true, postingDisabled: true });
  return new AgentBridgeService({
    store,
    extractor: fixtureExtractor,
    posting: recordingPostingPort(),
    commerce: commercePort(),
    policyFor: async () => defaultPolicy(),
  });
}

describe('AgentBridge commerce mapping tools', () => {
  it('keeps purchase-only actors off mapping tools', async () => {
    const purchase = actor(['read', 'upload', 'draft', 'approve', 'post']);
    expect(toolsForActor(purchase)).toEqual([...TOOL_NAMES]);
    expect(toolsForActor(purchase)).not.toEqual(expect.arrayContaining([...COMMERCE_READ_TOOL_NAMES]));
    const listed = await handleMcpJsonRpc({
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      service: await svc(purchase.capabilities),
      actor: purchase,
    });
    const names = ((listed.result as { tools: { name: string }[] }).tools).map((t) => t.name);
    expect(names).toEqual([...TOOL_NAMES]);
    expect(names).not.toContain('preview_mapping_proposal');
    expect(names).not.toContain('list_commerce_connections');
  });

  it('lists read tools for commerce_read and the proposal tool only with commerce_propose', async () => {
    const readOnly = actor(['read', 'upload', 'draft', 'commerce_read']);
    expect(toolsForActor(readOnly)).toEqual(expect.arrayContaining([...COMMERCE_READ_TOOL_NAMES]));
    expect(toolsForActor(readOnly)).not.toEqual(expect.arrayContaining([...COMMERCE_PROPOSE_TOOL_NAMES]));
    const propose = actor(['read', 'upload', 'draft', 'commerce_read', 'commerce_propose']);
    expect(toolsForActor(propose)).toEqual(expect.arrayContaining([...COMMERCE_PROPOSE_TOOL_NAMES]));
  });

  it('lets a propose actor preview mappings and never apply them', async () => {
    const service = await svc();
    const propose = actor(['read', 'upload', 'draft', 'commerce_read', 'commerce_propose']);
    const preview = await handleMcpJsonRpc({
      body: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'preview_mapping_proposal',
          arguments: {
            connectionId: 'c1',
            observations: [{ sku: 'SKU-1', externalProductId: 'woo-12', origin: 'agent' }],
          },
        },
      },
      service,
      actor: propose,
    });
    const structured = (preview.result as { structuredContent: Record<string, unknown> }).structuredContent;
    expect(structured.ok).toBe(true);
    expect(structured.applyInBookOne).toBe(true);
    expect(structured.humanApprovalRequired).toBe(true);
    expect(JSON.stringify(structured)).not.toMatch(/applied":1/);
  });

  it('denies mapping tools without the capability and never exposes keys', async () => {
    const service = await svc(['read', 'upload', 'draft']);
    const purchase = actor(['read', 'upload', 'draft']);
    const denied = await handleMcpJsonRpc({
      body: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'list_commerce_connections', arguments: {} },
      },
      service,
      actor: purchase,
    });
    expect(denied.error?.code).toBe(-32001);
    expect(String(denied.error?.message ?? '')).toMatch(/commerce_read|PERMISSION_DENIED|Missing capability/i);

    const allowed = await handleMcpJsonRpc({
      body: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'list_commerce_connections', arguments: {} },
      },
      service: await svc(),
      actor: actor(['read', 'commerce_read']),
    });
    const listed = (allowed.result as { structuredContent: { keysExposed?: boolean; items?: unknown[] } }).structuredContent;
    expect(listed.keysExposed).toBe(false);
    expect(JSON.stringify(listed)).not.toMatch(/bkc_|token|secret/i);
  });
});
