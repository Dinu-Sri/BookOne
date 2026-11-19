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
    expect(required).toContain('dashboard-db01');
    expect(required).toContain('coa-01');
    expect(required).toContain('ui-02');
    expect(required).toContain('pilot-custom-bank');
    expect(requiredCoreGuardSuites().find((s) => s.id === 'independent-acceptance')?.command).toMatch(
      /coreguard-invoice-intake/,
    );
    expect(coreGuardReport().note).toMatch(/does not certify all ERP modules/);
    expect(coreGuardReport().note).toMatch(/Dashboard DB-01/);
    expect(coreGuardReport().note).toMatch(/COA-01/);
    expect(coreGuardReport().note).toMatch(/UI-02/);
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
    expect(yaml).toMatch(/Dashboard DB-01/);
    expect(yaml).toMatch(/e2e\/dashboard-db01\.spec\.ts/);
    expect(yaml).toMatch(/Chart of Accounts COA-01/);
    expect(yaml).toMatch(/e2e\/coa-01\.spec\.ts/);
    expect(yaml).toMatch(/UI consistency UI-02/);
    expect(yaml).toMatch(/e2e\/ui-02\.spec\.ts/);
    expect(yaml).toMatch(/ui-02-lint\.test\.ts/);
    expect(yaml).toMatch(/Pilot custom-bank/);
    expect(yaml).toMatch(/pnpm coreguard:pilot/);
    expect(yaml).toMatch(/coreguard-invoice-intake\.test\.ts/);
    expect(yaml).toMatch(/e2e\/agent-bridge-connect\.spec\.ts/);
    expect(yaml).toMatch(/oauth-connect-workflow\.test\.ts/);
    expect(yaml).toMatch(/oauth-codex-login\.test\.ts/);
    expect(yaml).toMatch(/connection-prompts\.test\.ts/);
    expect(yaml).toMatch(/oauth-redeem\.test\.ts/);
    expect(yaml).toMatch(/ab09-acceptance\.test\.ts/);
    expect(yaml).toMatch(/ab10-acceptance\.test\.ts/);
    expect(yaml).toMatch(/oauth-callback-preservation\.test\.ts/);
    expect(yaml).toMatch(/ab11-acceptance\.test\.ts/);
    expect(yaml).toMatch(/mcp-http-negotiation\.test\.ts/);
    expect(yaml).toMatch(/e2e\/agent-bridge-consent\.spec\.ts/);
    expect(yaml).not.toMatch(/^\s+if: always\(/m);
    expect(yaml).not.toMatch(/^\s+if: failure\(/m);
  });
});
