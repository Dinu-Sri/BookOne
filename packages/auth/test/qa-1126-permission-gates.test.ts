import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { templateByKey } from '../src/permissions/templates';
import { allows, type ResolveInput } from '../src/permissions/resolve';
import { pickPartyByName, AMBIGUOUS_PARTY_MESSAGE } from '../../../apps/web/src/lib/party-match';
import { commitOutcomeMessage } from '../../../apps/web/src/lib/agent-bridge-commit-outcome';
import { signUpMessage } from '../../../apps/web/src/lib/sign-up-message';

const WEB = path.resolve(__dirname, '../../../apps/web/src');
const src = (rel: string) => readFileSync(path.join(WEB, rel), 'utf8');

function input(templateKey: string): ResolveInput {
  const tmpl = templateByKey(templateKey);
  return {
    platformRole: 'user',
    rbacEnforced: true,
    primaryTemplateKey: templateKey,
    extraTemplateKey: null,
    grants: (tmpl?.grants ?? []).map((key) => ({
      key,
      level: (key.endsWith('.write') ? 'write' : 'read') as 'read' | 'write',
    })),
    overrides: [],
    entityKind: 'company',
    capabilityTier: 'full',
    modules: { sales: true, purchase: true, inventory: true, pos: true, rental: true },
  };
}

/** Body of one exported function, up to the next top-level export. */
function fnBody(file: string, name: string): string {
  const text = src(file);
  const start = text.indexOf(`export async function ${name}(`);
  expect(start, `${name} in ${file}`).toBeGreaterThanOrEqual(0);
  const next = text.indexOf('\nexport ', start + 10);
  return text.slice(start, next < 0 ? undefined : next);
}

const GATED_KEYS = ['sales.discounts.write', 'company.domains.write', 'accounting.reconciliation.write'];

describe('QA-1126 permission gates', () => {
  it.each(['viewer', 'cashier'])('%s holds none of the newly gated write keys', (role) => {
    for (const key of GATED_KEYS) expect(allows(input(role), key, 'write'), `${role} ${key}`).toBe(false);
  });

  it('owner still holds every gated write key', () => {
    for (const key of GATED_KEYS) expect(allows(input('owner'), key, 'write'), key).toBe(true);
  });

  it('QA-1126-02: every discount write action checks sales.discounts.write before writing', () => {
    for (const fn of ['createDiscountFromForm', 'updateDiscountFromForm', 'setDiscountActiveFromForm', 'archiveDiscountFromForm']) {
      const body = fnBody('app/actions/discounts.ts', fn);
      const gate = body.indexOf("requireWriteOrRedirect('sales.discounts.write'");
      expect(gate, fn).toBeGreaterThan(0);
      expect(gate, `${fn} gates before writing`).toBeLessThan(body.indexOf('withTenantContext'));
    }
    expect(src('app/sales/discounts/page.tsx')).toMatch(/canWrite=\{jobCanWrite\(tenant, 'Discounts'\)\}/);
  });

  it('QA-1126-03: domain add and verify check company.domains.write and write an audit row', () => {
    for (const fn of ['createCompanyDomain', 'verifyCompanyDomain']) {
      const body = fnBody('app/actions/company-domains.ts', fn);
      expect(body, fn).toMatch(/requireWriteOrRedirect\('company\.domains\.write'/);
      expect(body.indexOf('requireWriteOrRedirect'), `${fn} gates before the DNS lookup`).toBeLessThan(
        body.indexOf('withTenantContext'),
      );
      expect(body, fn).toMatch(/auditLog/);
    }
  });

  it('QA-1126-05: every reconciliation and import write action refuses before doing work', () => {
    const files: Record<string, string[]> = {
      'app/actions/bank-import-studio.ts': ['createStudioDraft', 'saveStudioDraftStep', 'commitStudioImport'],
      'app/actions/bank-reconciliation.ts': [
        'confirmCaseMatch', 'bulkConfirmStrongMatches', 'undoCaseMatch', 'markCaseOutstanding', 'createCaseEntry',
        'finishReconciliationSession', 'confirmTransferCase', 'rejectTransferCase', 'confirmGroupMatch', 'excludeCase',
        'reopenReconciliationSession', 'matchBankToBook', 'confirmManyBanksOneBook', 'voidBankImport',
        'rebuildSessionSuggestions',
      ],
      'app/actions/statement-import.ts': [
        'commitStatementImport', 'commitStatementBatch', 'confirmStatementLinks', 'manualLinkStatementLine',
        'confirmStatementCreates', 'skipStatementLines', 'undoStatementCreates', 'voidStatementImport',
        'runStatementMatchPass', 'markLinesUnmatched',
      ],
      'app/actions/reconciliation.ts': ['createBankStatementImport', 'updateBankStatementLineStatus', 'lockPeriod'],
    };
    for (const [file, fns] of Object.entries(files)) {
      for (const fn of fns) {
        const body = fnBody(file, fn);
        const gate = body.indexOf("writeDeniedMessage('accounting.reconciliation.write'");
        expect(gate, `${file} ${fn}`).toBeGreaterThan(0);
        expect(body.slice(gate, gate + 260), `${fn} returns the refusal`).toMatch(
          /if \(denied\) return \{ ok: false, error: denied \}/,
        );
        expect(gate, `${fn} gates before its try block`).toBeLessThan(body.indexOf('try {'));
      }
    }
    // Actions that post or reverse journals also need a posting grant.
    for (const [file, fn] of [
      ['app/actions/bank-reconciliation.ts', 'createCaseEntry'],
      ['app/actions/bank-reconciliation.ts', 'confirmTransferCase'],
      ['app/actions/statement-import.ts', 'confirmStatementCreates'],
      ['app/actions/statement-import.ts', 'undoStatementCreates'],
    ] as const) {
      expect(fnBody(file, fn), fn).toMatch(/'accounting\.simple_entry\.write', 'accounting\.cashbook\.write'/);
    }
  });

  it('QA-1126-05: product archive, restore and delete check inventory write', () => {
    for (const fn of ['archiveProductFromForm', 'restoreProductFromForm', 'deleteProductFromForm']) {
      expect(fnBody('app/actions/inventory.ts', fn), fn).toMatch(/requireModuleWriteOrRedirect\('inventory'/);
    }
  });

  it('QA-1126-09: form actions redirect a refusal instead of throwing a 500', () => {
    expect(src('app/actions/agent-bridge.ts')).not.toMatch(/await assertPermission\('[a-z_.]+', 'write'\)/);
    for (const fn of ['saveCompanyProfile', 'saveTaxProfile']) {
      expect(fnBody('app/actions/company-settings.ts', fn), fn).toMatch(/requireWriteOrRedirect\(/);
    }
    expect(src('app/actions/pos-registers.ts')).not.toMatch(/assertPermission\(POS_REGISTER_WRITE/);
  });
});

describe('QA-1126-01 OAuth consent redirect', () => {
  it('redirects Allow and Cancel with 303 so the client callback receives a GET', () => {
    const route = src('app/api/agent-bridge/oauth/authorize/route.ts');
    const post = route.slice(route.indexOf('export async function POST'));
    const redirects = post.match(/NextResponse\.redirect\([\s\S]*?\);/g) ?? [];
    expect(redirects.length).toBeGreaterThanOrEqual(2);
    for (const r of redirects) expect(r).toMatch(/,\s*303\)/);
  });
});

describe('QA-1126-04 party resolution', () => {
  const legal = { id: 'cus-1', name: 'Acme Trading (Private) Limited', displayName: 'Acme' };
  const other = { id: 'cus-9', name: 'Acme', displayName: null };

  it('resolves a display name to the existing party instead of creating one', () => {
    expect(pickPartyByName([legal], 'acme')?.id).toBe('cus-1');
  });

  it('prefers a legal-name match over a display-name match', () => {
    expect(pickPartyByName([legal, other], 'Acme')?.id).toBe('cus-9');
  });

  it('refuses when several parties share the display name', () => {
    const twin = { id: 'cus-2', name: 'Acme Holdings', displayName: 'Acme' };
    expect(() => pickPartyByName([legal, twin], 'Acme')).toThrow(AMBIGUOUS_PARTY_MESSAGE);
  });

  it('the picker submits the party id and posting resolves by id or display name', () => {
    expect(src('components/module/party-name-fields.tsx')).toMatch(/name="partyId"/);
    const docs = src('app/actions/commercial-docs.ts');
    expect(docs).toMatch(/partyId: selectedPartyId/);
    expect(docs).toMatch(/id: partyIdForEnsure/);
    const parties = src('app/actions/parties.ts');
    expect(parties).toMatch(/lower\(coalesce\(\$\{parties\.displayName\}, ''\)\) = lower\(\$\{name\}\)/);
    expect(parties).toMatch(/export async function mergeDuplicatePartyFromForm/);
  });
});

describe('QA-1126-08/10/15 messages', () => {
  it('every non-posted commit outcome has a message', () => {
    expect(commitOutcomeMessage({ operationId: 'o', idempotencyKey: 'k', status: 'posted' })).toBeNull();
    expect(
      commitOutcomeMessage({ ok: false, code: 'POSTING_DISABLED', error: 'Agent posting is stopped for this company.' }),
    ).toBe('Agent posting is stopped for this company.');
    expect(commitOutcomeMessage({ status: 'failed', error: 'Duplicate bill: ABC-2611-001' })).toMatch(
      /not posted: Duplicate bill/,
    );
    expect(commitOutcomeMessage({ status: 'unknown_outcome' })).toMatch(/Check Purchases/);
    expect(commitOutcomeMessage(null)).toBeTruthy();
  });

  it('preview warns about a duplicate supplier invoice before approval', () => {
    expect(src('app/actions/agent-bridge.ts')).toMatch(/duplicateBillWarning\(service, actor, documentId/);
  });

  it('approval line shows a name, not the raw user id', () => {
    const page = src('app/purchase/inbox/[id]/page.tsx');
    expect(page).not.toMatch(/Approved by \{storeApproval\.actorUserId\}/);
    expect(page).toMatch(/Approved by \{approverName\}/);
  });

  it('sign-up notice matches whether verification is enforced', () => {
    expect(signUpMessage(true)).toBe('Account created. You can sign in now.');
    expect(signUpMessage(false)).toMatch(/verify/);
  });
});
