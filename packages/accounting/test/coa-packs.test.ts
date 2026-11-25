import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chartOfAccountsForEntity,
  coaRenamesForEntity,
  DEFAULT_CHART_OF_ACCOUNTS,
  PERSONAL_CHART_OF_ACCOUNTS,
} from '../src';

const personalAccounts = (hasPostings = false) =>
  PERSONAL_CHART_OF_ACCOUNTS.map((a) => ({ code: a.code, name: a.name, hasPostings }));

describe('coaRenamesForEntity', () => {
  it('renames personal-seeded accounts when a workspace becomes a company', () => {
    const renames = coaRenamesForEntity('company', personalAccounts());
    const byCode = Object.fromEntries(renames.map((r) => [r.code, r]));
    expect(byCode['6500']).toEqual({ code: '6500', from: 'Healthcare', to: 'Office Supplies Expense' });
    expect(byCode['6300']).toEqual({ code: '6300', from: 'Food & Household', to: 'Salaries Expense' });
    expect(byCode['6600']).toEqual({ code: '6600', from: 'Education', to: 'Bank Charges' });
    expect(byCode['1100']).toEqual({ code: '1100', from: 'Bank Account', to: 'Commercial Bank' });
  });

  it('leaves every company account matching the company pack afterwards', () => {
    const renames = new Map(coaRenamesForEntity('company', personalAccounts()).map((r) => [r.code, r.to]));
    const company = new Map(DEFAULT_CHART_OF_ACCOUNTS.map((a) => [a.code, a.name]));
    for (const a of PERSONAL_CHART_OF_ACCOUNTS) {
      expect(renames.get(a.code) ?? a.name).toBe(company.get(a.code));
    }
  });

  it('never renames an account that already has postings', () => {
    expect(coaRenamesForEntity('company', personalAccounts(true))).toEqual([]);
  });

  it('never renames an account the user renamed themselves', () => {
    const renames = coaRenamesForEntity('company', [
      { code: '6500', name: 'Medical & Staff Welfare', hasPostings: false },
    ]);
    expect(renames).toEqual([]);
  });

  it('is a no-op for personal and sole prop workspaces on the personal pack', () => {
    expect(coaRenamesForEntity('personal', personalAccounts())).toEqual([]);
    const sole = chartOfAccountsForEntity('sole_prop').map((a) => ({ code: a.code, name: a.name, hasPostings: false }));
    expect(coaRenamesForEntity('sole_prop', sole)).toEqual([]);
  });

  it('SQL repair 052 covers exactly the personal/company name clashes', () => {
    const sqlText = readFileSync(
      path.resolve(__dirname, '../../db/migrations/052_company_coa_names.sql'),
      'utf8',
    );
    const inSql = [...sqlText.matchAll(/\('(\d+)', '((?:[^']|'')+)', '((?:[^']|'')+)'\)/g)]
      .map((m) => `${m[1]}|${m[2].replace(/''/g, "'")}|${m[3].replace(/''/g, "'")}`)
      .sort();
    const expected = coaRenamesForEntity('company', personalAccounts())
      .map((r) => `${r.code}|${r.from}|${r.to}`)
      .sort();
    expect(inSql).toEqual(expected);
  });

  it('is idempotent once applied', () => {
    const company = DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({ code: a.code, name: a.name, hasPostings: false }));
    expect(coaRenamesForEntity('company', company)).toEqual([]);
  });
});
