import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blockedCoreGuardSuites, coreGuardReport, requiredCoreGuardSuites } from '../src/coreguard';

describe('scoped CoreGuard registry', () => {
  it('keeps required suites distinct from blocked external configuration', () => {
    const required = requiredCoreGuardSuites().map((s) => s.id);
    const blocked = blockedCoreGuardSuites().map((s) => s.id);
    expect(required).toContain('unit-schema-state');
    expect(required).toContain('browser');
    expect(blocked).toEqual([
      'codex-claude-live-clients',
      'live-ocr-provider',
      'production-idp',
      'external-mcp-client',
      'github-branch-protection',
    ]);
    expect(required).toContain('full-workflow');
    expect(required).toContain('independent-acceptance');
    expect(required).toContain('archive-restore-pointers');
    expect(required).toContain('permissions-catalog');
    expect(coreGuardReport().note).toMatch(/does not certify all ERP modules/);
  });

  it('adds CoreGuard as an extra publication need without masking quality', () => {
    const yaml = readFileSync(path.resolve(__dirname, '../../../.github/workflows/docker-web.yml'), 'utf8');
    expect(yaml).toMatch(/name: Lint typecheck build test/);
    expect(yaml).toMatch(/pnpm lint/);
    expect(yaml).toMatch(/pnpm typecheck/);
    expect(yaml).toMatch(/pnpm build/);
    expect(yaml).toMatch(/pnpm test/);
    expect(yaml).toMatch(/needs: \[quality, coreguard\]/);
    expect(yaml).toMatch(/name: AgentBridge CoreGuard/);
    expect(yaml).not.toMatch(/^\s+if: always\(/m);
    expect(yaml).not.toMatch(/^\s+if: failure\(/m);
  });
});
