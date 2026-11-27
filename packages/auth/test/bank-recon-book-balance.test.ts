import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('Bank reconciliation: BookOne balance and plain wording', () => {
  const src = read('apps/web/src/app/actions/bank-reconciliation.ts');
  const fn = src.slice(src.indexOf('async function bookBalanceThrough('), src.indexOf('async function loadReconPostingAccounts('));

  it('BookOne closing comes from the ledger, so opening balances and journals count', () => {
    expect(fn).toContain('.from(journalLines)');
    expect(fn).toContain('journalEntries.voidedAt');
    expect(fn).toContain('lte(journalEntries.entryDate, asOf)');
    expect(fn).not.toContain('.from(transactions)');
  });

  it('bank-only lines carry a suggested category from the shared rules', () => {
    expect(src).toContain('row.suggestedCategory');
    expect(read('apps/web/src/components/reconciliation/reconciliation-compare.tsx')).toContain('createRow.suggestedCategory');
  });

  it('screens use plain words and link the guide', () => {
    expect(read('apps/web/src/components/bank-import-studio/studio-wizard.tsx')).toContain('Which account is this statement for?');
    expect(read('apps/web/src/app/reconciliation/page.tsx')).toContain('/docs/accounting/bank-reconciliation');
    expect(read('apps/web/content/docs/accounting/bank-reconciliation.mdx')).toContain('164,422.50');
  });
});
