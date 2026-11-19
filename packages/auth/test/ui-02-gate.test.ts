import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOG_VERSION, screenKeyFromHref } from '../src/permissions/catalog';

const root = path.resolve(__dirname, '../../..');

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('CoreGuard UI-02 source contracts', () => {
  it('keeps the permission catalog at v2 and maps CoA routes to accounting.accounts', () => {
    expect(CATALOG_VERSION).toBe(2);
    expect(screenKeyFromHref('/accounts')).toBe('accounting.accounts');
    expect(screenKeyFromHref('/accounts/new')).toBe('accounting.accounts');
    expect(screenKeyFromHref('/accounts/opening')).toBe('accounting.accounts');
    expect(screenKeyFromHref('/accounts/import')).toBe('accounting.accounts');
    expect(screenKeyFromHref('/advances')).toBe('accounting.accounts');
  });

  it('Accounts and Advances screens use shared SelectField, DateField, and FormBackLink', () => {
    const manager = read('apps/web/src/components/accounts/coa-manager.tsx');
    const wizard = read('apps/web/src/components/accounts/coa-wizard.tsx');
    const opening = read('apps/web/src/components/accounts/coa-opening.tsx');
    const importer = read('apps/web/src/components/accounts/coa-import.tsx');
    const detail = read('apps/web/src/components/accounts/coa-account-detail.tsx');
    const advances = read('apps/web/src/components/advances/advances-panel.tsx');
    expect(manager).toMatch(/SelectField/);
    expect(manager).toMatch(/SearchField/);
    expect(manager).toMatch(/PAGE_SIZE = 10/);
    expect(manager).toMatch(/archiveBlockedReason/);
    expect(manager).toMatch(/classLabel/);
    expect(manager).toMatch(/ConfirmDialog/);
    expect(manager).not.toMatch(/<select/);
    expect(wizard).toMatch(/FormShell/);
    expect(wizard).toMatch(/backHref="\/accounts"/);
    expect(wizard).toMatch(/SelectField/);
    expect(wizard).toMatch(/ROOT_CLASS_OPTIONS/);
    expect(opening).toMatch(/DateField/);
    expect(opening).toMatch(/AmountField/);
    expect(opening).toMatch(/stale/);
    expect(importer).toMatch(/TextAreaField/);
    expect(importer).toMatch(/backHref="\/accounts"/);
    expect(detail).toMatch(/classLabel/);
    expect(detail).toMatch(/FormShell/);
    expect(advances).toMatch(/FormBackLink/);
    expect(advances).toMatch(/href="\/accounts"/);
    expect(advances).toMatch(/DateField/);
    expect(advances).toMatch(/SelectField/);
    expect(advances).not.toMatch(/<select/);
    expect(advances).not.toMatch(/type="date"/);
  });

  it('Advances cash picker is spendable cash by code and name', () => {
    const page = read('apps/web/src/app/advances/page.tsx');
    const panel = read('apps/web/src/components/advances/advances-panel.tsx');
    expect(page).toMatch(/isSpendableCashCode/);
    expect(page).toMatch(/cashAccounts/);
    expect(panel).toMatch(/cashAccounts/);
    expect(panel).toContain('`${row.code} · ${row.name}`');
  });

  it('human-readable CoA labels replace raw subtype identifiers', () => {
    const labels = read('apps/web/src/lib/coa-labels.ts');
    expect(labels).toMatch(/operating_expense: 'Operating expense'/);
    expect(labels).toMatch(/customer_advance: 'Customer advance'/);
    const manager = read('apps/web/src/components/accounts/coa-manager.tsx');
    expect(manager).toMatch(/subtypeLabel/);
    expect(manager).not.toMatch(/\{row\.subtype\}/);
  });

  it('publication CoreGuard job runs UI-02 lint and browser checks unmasked', () => {
    const yaml = read('.github/workflows/docker-web.yml');
    const core = read('packages/agent-bridge/src/coreguard.ts');
    expect(yaml).toMatch(/UI consistency UI-02/);
    expect(yaml).toMatch(/ui-02-lint\.test\.ts/);
    expect(yaml).toMatch(/ui-02-gate\.test\.ts/);
    expect(yaml).toMatch(/e2e\/ui-02\.spec\.ts/);
    expect(yaml).toMatch(/needs: \[quality, coreguard\]/);
    expect(yaml).not.toMatch(/^\s+if: always\(/m);
    expect(yaml).not.toMatch(/^\s+if: failure\(/m);
    expect(core).toMatch(/id: 'ui-02'/);
    expect(core).toMatch(/e2e\/ui-02\.spec\.ts/);
  });

  it('registry documents approved wrappers and the native-control policy', () => {
    const registry = read('docs/UI_CONTROL_REGISTRY.md');
    expect(registry).toMatch(/SelectField/);
    expect(registry).toMatch(/DateField/);
    expect(registry).toMatch(/FormBackLink/);
    expect(registry).toMatch(/SelectLike/);
    expect(registry).toMatch(/UI-02/);
  });
});
