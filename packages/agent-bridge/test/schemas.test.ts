import { describe, expect, it } from 'vitest';
import { TOOL_INPUT_SCHEMAS, validateAgainstSchema } from '../src/schemas';
import { mcpToolsList } from '../src/mcp';
import { TOOL_NAMES } from '../src/service';

describe('strict AgentBridge schemas', () => {
  it('advertises a schema for every tool and never allows additionalProperties true', () => {
    const tools = mcpToolsList();
    expect(tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(JSON.stringify(tool.inputSchema)).not.toMatch(/"additionalProperties":true/);
    }
  });

  it('rejects unknown fields, malformed numbers and missing required keys', () => {
    expect(validateAgainstSchema(TOOL_INPUT_SCHEMAS.submit_extracted_facts!, {}).ok).toBe(false);
    expect(
      validateAgainstSchema(TOOL_INPUT_SCHEMAS.submit_extracted_facts!, {
        documentId: 'd1',
        contentHash: 'ab',
        expectedRevision: 0,
      }).ok,
    ).toBe(false);
    expect(
      validateAgainstSchema(TOOL_INPUT_SCHEMAS.submit_extracted_facts!, {
        documentId: 'd1',
        contentHash: 'a'.repeat(64),
        expectedRevision: 0,
        netMinor: 1.5,
      }).ok,
    ).toBe(false);
    expect(
      validateAgainstSchema(TOOL_INPUT_SCHEMAS.submit_extracted_facts!, {
        documentId: 'd1',
        contentHash: 'a'.repeat(64),
        expectedRevision: 0,
        approved: true,
      }).ok,
    ).toBe(false);
    expect(
      validateAgainstSchema(TOOL_INPUT_SCHEMAS.submit_extracted_facts!, {
        documentId: 'd1',
        contentHash: 'a'.repeat(64),
        expectedRevision: 0,
        netMinor: 100000,
      }).ok,
    ).toBe(true);
  });
});
