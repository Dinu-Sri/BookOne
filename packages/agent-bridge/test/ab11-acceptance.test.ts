import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COREGUARD_VERSION } from '../src/coreguard';
import {
  MCP_PROTOCOL_VERSION,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  SCHEMA_VERSION,
} from '../src/contracts';

const root = path.resolve(__dirname, '../../..');
function read(...parts: string[]) {
  return readFileSync(path.join(root, ...parts), 'utf8');
}

describe('AB-11 source contracts', () => {
  it('bumps CoreGuard to ab-11 and keeps protocol schema ab-06.1', () => {
    expect(COREGUARD_VERSION).toBe('ab-11');
    expect(SCHEMA_VERSION).toBe('ab-06.1');
    expect(MCP_PROTOCOL_VERSION).toBe('2025-06-18');
    expect([...MCP_SUPPORTED_PROTOCOL_VERSIONS]).toEqual(['2025-06-18', '2025-03-26', '2024-11-05']);
  });

  it('negotiates unknown versions instead of rejecting 2025-06-18', () => {
    const mcp = read('packages/agent-bridge/src/mcp.ts');
    const contracts = read('packages/agent-bridge/src/contracts.ts');
    expect(contracts).toMatch(/MCP_PROTOCOL_VERSION = '2025-06-18'/);
    expect(contracts).toMatch(/'2025-06-18', '2025-03-26', '2024-11-05'/);
    expect(mcp).toMatch(/return \{ ok: true, version: MCP_PROTOCOL_VERSION \}/);
    expect(mcp).not.toMatch(/Unsupported MCP protocol version \$\{requested\}/);
    expect(mcp).toMatch(/handleMcpHttpPost/);
    expect(mcp).toMatch(/isJsonRpcNotification/);
    expect(mcp).toMatch(/readMcpProtocolVersionHeader/);
  });

  it('wires Streamable HTTP negotiation through the real MCP route', () => {
    const route = read('apps/web/src/app/api/agent-bridge/mcp/route.ts');
    expect(route).toMatch(/handleMcpHttpPost/);
    expect(route).toMatch(/mcp-protocol-version/);
    expect(route).toMatch(/outcome\.json === null/);
    expect(route).toMatch(/status: 405/);
    expect(route).toMatch(/allow: 'POST'/);
    expect(route).not.toMatch(/handleMcpJsonRpc\(\{/);
    expect(route).toMatch(/resolveActorFromAuthorization/);
  });

  it('does not advertise unimplemented MCP capabilities', () => {
    const mcp = read('packages/agent-bridge/src/mcp.ts');
    expect(mcp).toMatch(/capabilities: \{ tools: \{ listChanged: false \} \}/);
    expect(mcp).not.toMatch(/elicitation:/);
    expect(mcp).not.toMatch(/resources: \{/);
    expect(mcp).not.toMatch(/prompts: \{/);
  });
});
