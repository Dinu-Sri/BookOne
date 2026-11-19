import { readFileSync } from 'node:fs';
import path from 'node:path';

export type BankReconCashLine = {
  date: string;
  amountCents: number;
  direction: 'in' | 'out';
  description: string;
  ref: string;
  category: string;
};

export type BankReconFixture = {
  id: 'bank-recon';
  version: number;
  layer: string;
  period: { from: string; to: string };
  currency: string;
  bank: {
    templateId: 'bank';
    code: string;
    name: string;
    institution: string;
    lastDigits: string;
  };
  equity: { code: string };
  income: { code: string };
  expense: { code: string };
  opening: {
    date: string;
    debitCents: number;
    creditCents: number;
    debitAccount: string;
    creditAccount: string;
    party: string;
  };
  matching: BankReconCashLine[];
  bookOnly: BankReconCashLine;
  fee: BankReconCashLine;
  statement: {
    openingCents: number;
    moneyInCents: number;
    moneyOutCents: number;
    closingCents: number;
    rowCount: number;
    isoFile: string;
    serialFile: string;
    invalidFile: string;
  };
  afterSeed: Record<string, number>;
  afterImportMatch: Record<string, number>;
  afterFeeAndWaiting: Record<string, number>;
};

export type CustomBankFixture = {
  id: 'custom-bank';
  version: number;
  layer: string;
  period: { from: string; to: string };
  currency: string;
  customBank: {
    templateId: 'bank';
    code: string;
    name: string;
    institution: string;
    lastDigits: string;
  };
  ownedBank: { code: string };
  equity: { code: string };
  opening: {
    date: string;
    debitCents: number;
    creditCents: number;
    debitAccount: string;
    creditAccount: string;
    party: string;
  };
  transfer: {
    date: string;
    amountCents: number;
    from: string;
    to: string;
    party: string;
  };
  afterCreate: Record<string, number>;
  afterOpening: Record<string, number>;
  afterTransfer: Record<string, number | boolean>;
  viewer: { accountsRead: boolean; accountsWrite: boolean; simpleEntryWrite: boolean };
};

const ROOT = path.resolve(__dirname, '../..');

export const FIXTURE_PATH = path.join(ROOT, 'docs/coreguard/fixtures/custom-bank.v1.json');
export const BANK_RECON_FIXTURE_PATH = path.join(ROOT, 'docs/coreguard/fixtures/bank-recon.v1.json');

export function loadCustomBankFixture(): CustomBankFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as CustomBankFixture;
}

export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function loadBankReconFixture(): BankReconFixture {
  return JSON.parse(readFileSync(BANK_RECON_FIXTURE_PATH, 'utf8')) as BankReconFixture;
}

/** Independent integer-cent oracle. Does not call production cash helpers. */
export function independentBankReconOracle(fixture: BankReconFixture) {
  const opening = fixture.opening.debitCents;
  const matchingIn = fixture.matching
    .filter((row) => row.direction === 'in')
    .reduce((sum, row) => sum + row.amountCents, 0);
  const matchingOut = fixture.matching
    .filter((row) => row.direction === 'out')
    .reduce((sum, row) => sum + row.amountCents, 0);
  const bookOnly = fixture.bookOnly.amountCents;
  const fee = fixture.fee.amountCents;
  const afterSeed = opening + matchingIn - matchingOut + bookOnly;
  const afterFee = afterSeed - fee;
  const difference = fixture.statement.closingCents - afterFee + bookOnly;
  return {
    afterSeed: { bank: afterSeed, journals: 1 + fixture.matching.length + 1 },
    afterImportMatch: { bank: afterSeed, journals: 1 + fixture.matching.length + 1 },
    afterFeeAndWaiting: {
      bank: afterFee,
      journals: 1 + fixture.matching.length + 2,
      outstanding: bookOnly,
      difference,
    },
    statement: {
      opening: fixture.statement.openingCents,
      moneyIn: fixture.statement.moneyInCents,
      moneyOut: fixture.statement.moneyOutCents,
      closing: fixture.statement.closingCents,
    },
  };
}

/** Independent integer-cent oracle. Does not call production cash helpers. */
export function independentCustomBankOracle(fixture: CustomBankFixture) {
  const opening = fixture.opening.debitCents;
  const xfer = fixture.transfer.amountCents;
  return {
    afterCreate: { custom: 0, owned: 0, spendable: 0 },
    afterOpening: { custom: opening, owned: 0, spendable: opening },
    afterTransfer: {
      custom: opening - xfer,
      owned: xfer,
      spendable: opening,
      externalIn: 0,
      externalOut: 0,
    },
  };
}
