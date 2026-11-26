import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { templateByKey } from '../src/permissions/templates';
import { allows, type ResolveInput } from '../src/permissions/resolve';
import { commerceTaxDecision } from '../../../apps/web/src/lib/commerce-tax';
import { firstFreeNumber } from '../../../apps/web/src/lib/first-free-number';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

function fnBody(text: string, signature: string): string {
  const start = text.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  const end = /\r?\n\}\r?\n/.exec(text.slice(start));
  return text.slice(start, end ? start + end.index : undefined);
}

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

describe('QA-1126-16 stock race', () => {
  it('stock decrements and lot consumption take a per-product transaction lock first', () => {
    const docs = read('apps/web/src/app/actions/commercial-docs.ts');
    const adjust = fnBody(docs, 'async function adjustStock(');
    expect(adjust.indexOf('lockProductStock(')).toBeGreaterThan(0);
    expect(adjust.indexOf('lockProductStock(')).toBeLessThan(adjust.indexOf('.from(inventoryStockLevels)'));
    const costing = read('apps/web/src/lib/inventory-costing.ts');
    expect(costing).toMatch(/pg_advisory_xact_lock\(hashtextextended/);
    const consume = fnBody(costing, 'export async function consumeCostLayers(');
    expect(consume.indexOf('lockProductStock(')).toBeLessThan(consume.indexOf('openLayers('));
  });

  it('posting reads stock policy by tenant, and commerce always blocks negative stock', () => {
    const docs = read('apps/web/src/app/actions/commercial-docs.ts');
    expect(docs).toMatch(/loadInventorySettings\(user\.tenantId\)/);
    expect(docs).toMatch(/negativeStockPolicy === 'block' \|\| Boolean\(opts\?\.forceBlockNegative\)/);
    expect(read('apps/web/src/lib/commerce-runtime.ts')).toMatch(/forceBlockNegative: true/);
  });

  it('QA-1126-21: a company that never chose a policy blocks negative stock', () => {
    const settings = read('apps/web/src/lib/tenant-settings.ts');
    expect(settings).toMatch(/INVENTORY_SETTINGS_DEFAULTS: TenantInventorySettings = \{\s*negativeStockPolicy: 'block'/);
    expect(settings).toMatch(/row\.negativeStockPolicy === 'allow' \? 'allow' : 'block'/);
  });
});

describe('QA-1126-17 numbering', () => {
  it('document numbers and party codes are allocated under a series lock', () => {
    const docs = read('apps/web/src/app/actions/commercial-docs.ts');
    const next = fnBody(docs, 'async function nextDocumentNumber(');
    expect(next).toMatch(/lockNumberSeries\(/);
    expect(next).not.toMatch(/isNull\(businessDocuments\.voidedAt\)/);
    const parties = read('apps/web/src/app/actions/parties.ts');
    expect(fnBody(parties, 'async function nextPartyCode(')).toMatch(/lockNumberSeries\(/);
  });

  it('skips numbers already taken, including voided ones', async () => {
    const taken = new Set(['INV-0006', 'INV-0007']);
    const got = await firstFreeNumber(6, (n) => `INV-${String(n).padStart(4, '0')}`, async (c) => taken.has(c));
    expect(got).toBe('INV-0008');
  });

  it('migration 053 repairs duplicates before adding unique indexes', () => {
    const sql = read('packages/db/migrations/053_unique_document_numbers.sql');
    expect(sql.indexOf('UPDATE business_documents')).toBeLessThan(sql.indexOf('business_documents_tenant_type_number_uq'));
    expect(sql.indexOf('UPDATE parties')).toBeLessThan(sql.indexOf('parties_tenant_code_uq'));
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
  });
});

describe('QA-1126-18 commerce returns', () => {
  it('a commerce return names the original invoice customer', () => {
    const runtime = read('apps/web/src/lib/commerce-runtime.ts');
    expect(runtime).not.toMatch(/partyName: 'Commerce refund'/);
    expect(runtime).toMatch(/partyName: source\.partyName,\s*partyId: source\.partyId/);
  });
});

describe('QA-1126-19 POS refunds', () => {
  it('Cashier cannot post returns, Owner can', () => {
    expect(allows(input('cashier'), 'sales.returns.write', 'write')).toBe(false);
    expect(allows(input('owner'), 'sales.returns.write', 'write')).toBe(true);
  });

  it('the till says so before a refund is built, and the server refuses with the same rule', () => {
    const session = read('apps/web/src/app/actions/pos-session.ts');
    const ret = fnBody(session, 'export async function completePosReturn(');
    expect(ret).toMatch(/allows\('sales\.returns\.write', 'write'\)/);
    expect(session).toMatch(/canRefund: Boolean\(/);
    const terminal = read('apps/web/src/components/pos/pos-terminal.tsx');
    expect(terminal).toMatch(/disabled=\{!bootstrap\.canRefund\}/);
    expect(terminal).toMatch(/next === 'return' && !bootstrap\.canRefund/);
  });
});

describe('QA-1126-20 commerce VAT', () => {
  const base = { ratePercent: 18, linesNet: 1000, headerDiscount: 0, lineCount: 1 };

  it('VAT-registered company: matching shop tax posts a tax invoice', () => {
    expect(commerceTaxDecision({ ...base, vatRegistered: true, storeTax: 180 })).toEqual({ kind: 'tax_invoice' });
  });

  it('VAT-registered company: no shop tax is held for review, never posted without VAT', () => {
    const out = commerceTaxDecision({ ...base, vatRegistered: true, storeTax: 0 });
    expect(out.kind).toBe('review');
  });

  it('VAT-registered company: a different tax amount is held for review', () => {
    const out = commerceTaxDecision({ ...base, vatRegistered: true, storeTax: 152.54 });
    expect(out).toMatchObject({ kind: 'review' });
    expect(out.kind === 'review' && out.reason).toMatch(/does not match BookOne VAT 180\.00/);
  });

  it('not VAT registered: untaxed posts commercial, taxed is held', () => {
    expect(commerceTaxDecision({ ...base, vatRegistered: false, storeTax: 0 })).toEqual({ kind: 'commercial' });
    expect(commerceTaxDecision({ ...base, vatRegistered: false, storeTax: 180 }).kind).toBe('review');
  });
});

describe('Commerce Payments settings', () => {
  it('only cash, bank or clearing accounts can be chosen, and clearing accounts use 1201–1299', () => {
    const lib = read('apps/web/src/lib/commerce-payment-accounts.ts');
    expect(lib).toMatch(/isCashUniverseCode\(r\.code\)/);
    expect(lib).toMatch(/nextSuggestedCode\(\{ from: 1201, to: 1299 \}/);
    const actions = read('apps/web/src/app/actions/commerce.ts');
    expect(actions).toMatch(/listCommercePaymentAccounts\(operator\.tenantId\)/);
    expect(actions).toMatch(/writeDeniedMessage\('accounting\.accounts\.write'\)/);
  });

  it('the Payments card uses registry fields and names no specific gateway', () => {
    const card = read('apps/web/src/components/commerce/commerce-payments-card.tsx');
    expect(card).toMatch(/from '@\/components\/ui\/select-field'/);
    expect(card).not.toMatch(/<select\b/);
    expect(card.toLowerCase()).not.toMatch(/payhere|stripe|webxpay|onepay/);
  });
});
