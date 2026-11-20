import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allows, type ResolveInput } from '../src/permissions/resolve';
import { grantsFromTemplateKey } from '../src/permissions/grants';

const root = path.resolve(__dirname, '../../..');

function access(templateKey: string): ResolveInput {
  return {
    platformRole: 'user',
    rbacEnforced: true,
    primaryTemplateKey: templateKey,
    extraTemplateKey: null,
    grants: grantsFromTemplateKey(templateKey),
    overrides: [],
    entityKind: 'company',
    capabilityTier: 'full',
    modules: { sales: true, purchase: true, inventory: false, pos: false, rental: false, hr: false },
  };
}

describe('custom-bank permission and isolation contracts', () => {
  it('Owner may write accounts and Simple Entry; Viewer is read-only', () => {
    const owner = access('owner');
    const viewer = access('viewer');
    expect(allows(owner, 'accounting.accounts.write', 'write')).toBe(true);
    expect(allows(owner, 'accounting.simple_entry.write', 'write')).toBe(true);
    expect(allows(viewer, 'accounting.accounts.read', 'read')).toBe(true);
    expect(allows(viewer, 'accounting.accounts.write', 'write')).toBe(false);
    expect(allows(viewer, 'accounting.simple_entry.write', 'write')).toBe(false);
  });

  it('Simple Entry tenders include custom 11xx banks', () => {
    const screen = readFileSync(path.join(root, 'apps/web/src/components/simple-entry/simple-entry-screen.tsx'), 'utf8');
    expect(screen).toMatch(/isLiquidTenderCode/);
    expect(screen).not.toMatch(/\['1000', '1100', '1200', '1300'\]/);
  });

  it('publication CoreGuard job runs the custom-bank lane unmasked', () => {
    const yaml = readFileSync(path.join(root, '.github/workflows/docker-web.yml'), 'utf8');
    const core = readFileSync(path.join(root, 'packages/agent-bridge/src/coreguard.ts'), 'utf8');
    expect(yaml).toMatch(/Pilot custom-bank/);
    expect(yaml).toMatch(/pnpm coreguard:pilot/);
    const runner = readFileSync(path.join(root, 'scripts/coreguard/run.ts'), 'utf8');
    expect(runner).toMatch(/drizzle-kit/);
    expect(runner).toMatch(/init-db\.ts/);
    expect(runner).toMatch(/cleanupPilotSeed/);
    expect(runner).toMatch(/test:coreguard-browser/);
    expect(yaml).toMatch(/needs: \[quality, coreguard\]/);
    expect(yaml).toMatch(/coreguard-setup-order\.test\.ts/);
    expect(yaml).toMatch(/coreguard-invoice-intake\.test\.ts/);
    expect(runner).toMatch(/coreguard-bank-recon-oracle\.test\.ts/);
    expect(runner).toMatch(/coreguard-bank-recon-postgres\.test\.ts/);
    const pw = readFileSync(path.join(root, 'apps/web/playwright.coreguard.config.ts'), 'utf8');
    expect(pw).toMatch(/coreguard-\(custom-bank\|bank-recon(?:\|commerce)?\)/);
    expect(core).toMatch(/id: 'pilot-custom-bank'/);
    expect(core).toMatch(/pnpm coreguard:pilot/);
    const readme = readFileSync(path.join(root, 'docs/coreguard/README.md'), 'utf8');
    expect(readme).toMatch(/pnpm coreguard:pilot/);
    expect(readme).toMatch(/bookone_test/);
    const matrix = readFileSync(path.join(root, 'docs/coreguard/coverage-matrix.md'), 'utf8');
    expect(matrix).toMatch(/custom-bank/);
    expect(matrix).toMatch(/POS/);
    expect(matrix).toMatch(/rental/i);
    expect(matrix).toMatch(/LAST/);
  });
});
